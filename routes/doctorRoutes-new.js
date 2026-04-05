const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { uploadBuffer } = require('../utils/cloudinaryUpload');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');

const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');

// use memory storage so we can upload buffer to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/doctors/register
router.post('/register', upload.fields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'certificates', maxCount: 1 }
]), async (req, res) => {
  try {
    const {
      name,
      age,
      sex,
      qualification,
      phone,
      alternateMobile,
      email,
      password,
      houseAddress,
      clinicAddress,
      nominee,
      familyMember1,
      familyMember2,
      acceptTerms,
      subscribeUpdates
    } = req.body;

    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: 'name, phone, email, password are required' });
    }

    const existing = await Doctor.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(409).json({ message: 'Doctor with this email or phone already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const doctorData = {
      name,
      age,
      sex,
      qualification,
      phone,
      alternateMobile,
      email,
      passwordHash,
      passportPhoto: null,
      certificates: null,
      houseAddress,
      clinicAddress,
      nominee: nominee ? (typeof nominee === 'string' ? JSON.parse(nominee) : nominee) : undefined,
      familyMember1: familyMember1 ? (typeof familyMember1 === 'string' ? JSON.parse(familyMember1) : familyMember1) : undefined,
      familyMember2: familyMember2 ? (typeof familyMember2 === 'string' ? JSON.parse(familyMember2) : familyMember2) : undefined,
      acceptTerms: !!acceptTerms,
      subscribeUpdates: !!subscribeUpdates
    };

    const passportFile = req.files?.passportPhoto?.[0];
    const certFile = req.files?.certificates?.[0];

    if (passportFile) {
      try {
        const uploadRes = await uploadBuffer(passportFile.buffer, { 
          folder: 'doctors/passports',
          transformation: [{ width: 500, height: 500, crop: 'fill' }],
          resource_type: 'image'
        });
        if (!uploadRes || !uploadRes.secure_url) {
          throw new Error('Invalid response from Cloudinary upload');
        }
        doctorData.passportPhoto = uploadRes.secure_url;
        doctorData.passportPhotoPublicId = uploadRes.public_id;
      } catch (error) {
        console.error('Passport photo upload error:', error);
        return res.status(500).json({ message: 'Failed to upload passport photo: ' + error.message });
      }
    }

    if (certFile) {
      try {
        const uploadRes = await uploadBuffer(certFile.buffer, { 
          folder: 'doctors/certificates',
          resource_type: 'auto',
          allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (!uploadRes || !uploadRes.secure_url) {
          throw new Error('Invalid response from Cloudinary upload');
        }
        doctorData.certificates = uploadRes.secure_url;
        doctorData.certificatesPublicId = uploadRes.public_id;
      } catch (error) {
        console.error('Certificate upload error:', error);
        return res.status(500).json({ message: 'Failed to upload certificate: ' + error.message });
      }
    }

    const doctor = await Doctor.create(doctorData);
    const token = generateToken({ id: doctor._id, role: 'doctor' });
    return res.status(201).json({
      success: true,
      data: {
        _id: doctor._id,
        name: doctor.name,
        phone: doctor.phone,
        email: doctor.email,
        token
      }
    });
  } catch (error) {
    console.error('Error in /api/doctors/register:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error occurred during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// POST /api/doctors/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const isMatch = await bcrypt.compare(password, doctor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = generateToken({ id: doctor._id, role: 'doctor' });
    return res.json({ _id: doctor._id, name: doctor.name, email: doctor.email, token });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/doctors
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const doctors = await Doctor.find(filter).sort({ createdAt: -1 });
    return res.json(doctors);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/doctors/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const doctor = await Doctor.findById(id).select('-passwordHash');
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    return res.json(doctor);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/doctors/:id/profile - Update profile
router.patch('/:id/profile', authMiddleware, upload.fields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'certificates', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Security check
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Get the current doctor
    const doctor = await Doctor.findById(id);
    if (!doctor) {
      return res.status(404).json({ message: 'Doctor not found' });
    }

    // Build update object
    const updateData = {};
    console.log('Received update data:', req.body);

    // Handle basic fields
    const basicFields = [
      'name', 'age', 'sex', 'qualification', 'phone', 'email',
      'alternateMobile', 'houseAddress', 'clinicAddress'
    ];

    basicFields.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== '') {
        updateData[field] = req.body[field];
      }
    });

    // Handle nested objects
    ['nominee', 'familyMember1', 'familyMember2'].forEach(key => {
      if (req.body[key]) {
        try {
          const data = typeof req.body[key] === 'string' ? JSON.parse(req.body[key]) : req.body[key];
          if (Object.keys(data).length > 0) {
            updateData[key] = data;
          }
        } catch (e) {
          console.error(`Error parsing ${key}:`, e);
        }
      }
    });

    // Handle password update
    if (req.body.password && req.body.password.length >= 6) {
      updateData.passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    // Handle file uploads
    const passportFile = req.files?.passportPhoto?.[0];
    const certFile = req.files?.certificates?.[0];

    if (passportFile) {
      try {
        const uploadRes = await uploadBuffer(passportFile.buffer, {
          folder: 'doctors/passports',
          transformation: [{ width: 500, height: 500, crop: 'fill' }],
          resource_type: 'image'
        });
        if (uploadRes && uploadRes.secure_url) {
          updateData.passportPhoto = uploadRes.secure_url;
          updateData.passportPhotoPublicId = uploadRes.public_id;
        }
      } catch (err) {
        console.error('Passport photo upload error:', err);
        return res.status(500).json({ 
          success: false,
          message: 'Failed to upload passport photo' 
        });
      }
    }

    if (certFile) {
      try {
        const uploadRes = await uploadBuffer(certFile.buffer, {
          folder: 'doctors/certificates',
          resource_type: 'auto',
          allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (uploadRes && uploadRes.secure_url) {
          updateData.certificates = uploadRes.secure_url;
          updateData.certificatesPublicId = uploadRes.public_id;
        }
      } catch (err) {
        console.error('Certificate upload error:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload certificate'
        });
      }
    }

    // Update doctor document
    console.log('Updating doctor with data:', updateData);

    const updatedDoctor = await Doctor.findOneAndUpdate(
      { _id: id },
      { $set: updateData },
      { 
        new: true,
        runValidators: true,
        select: '-passwordHash'
      }
    );

    if (!updatedDoctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found'
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedDoctor
    });

  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// PATCH /api/doctors/:id/approve
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { disease, message } = req.body;

    if (!disease) {
      return res.status(400).json({ message: 'Disease name is required for approval' });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    
    doctor.status = 'approved';
    doctor.approvedDisease = disease;
    doctor.approvedMessage = message || '';
    doctor.approvedDate = new Date();
    
    await doctor.save();
    return res.json({ message: 'Approved', doctor });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// POST /api/doctors/:id/deceased
router.post('/:id/deceased', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, diseaseName } = req.body;
    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    
    doctor.status = 'deceased';
    doctor.deceasedReason = reason;
    doctor.deceasedDisease = diseaseName;
    doctor.deceasedDate = new Date();
    
    await doctor.save();
    return res.json({ message: 'Doctor marked deceased' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;