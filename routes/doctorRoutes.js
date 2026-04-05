const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { uploadBuffer } = require('../utils/cloudinaryUpload');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');
const { sendWelcomeEmail } = require('../utils/emailService');

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

  const passportFile = req.files && req.files.passportPhoto ? req.files.passportPhoto[0] : null;
  const certFile = req.files && req.files.certificates ? req.files.certificates[0] : null;

    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: 'name, phone, email, password are required' });
    }

    const existing = await Doctor.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(409).json({ message: 'Doctor with this email or phone already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Parse nominee and validate bank details
    let nomineeObj = nominee ? (typeof nominee === 'string' ? JSON.parse(nominee) : nominee) : undefined;
    if (!nomineeObj || !nomineeObj.bankAccountNumber || !nomineeObj.confirmBankAccountNumber || !nomineeObj.ifscCode || !nomineeObj.bankHolderName) {
      return res.status(400).json({ message: 'Nominee bank details are required.' });
    }
    if (nomineeObj.bankAccountNumber !== nomineeObj.confirmBankAccountNumber) {
      return res.status(400).json({ message: 'Nominee account numbers do not match.' });
    }
    // Remove confirmBankAccountNumber before saving
    delete nomineeObj.confirmBankAccountNumber;

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
      nominee: nomineeObj,
      familyMember1: familyMember1 ? (typeof familyMember1 === 'string' ? JSON.parse(familyMember1) : familyMember1) : undefined,
      familyMember2: familyMember2 ? (typeof familyMember2 === 'string' ? JSON.parse(familyMember2) : familyMember2) : undefined,
      acceptTerms: !!acceptTerms,
      subscribeUpdates: !!subscribeUpdates
    };

    // upload files to Cloudinary if present
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
        // Log the full response for debugging (avoid sensitive fields)
        console.log('Cloudinary passport upload response:', {
          public_id: uploadRes.public_id,
          secure_url: uploadRes.secure_url,
          resource_type: uploadRes.resource_type,
          format: uploadRes.format,
          bytes: uploadRes.bytes
        });
        doctorData.passportPhoto = uploadRes.secure_url;
        doctorData.passportPhotoPublicId = uploadRes.public_id;
      } catch (error) {
        console.error('Passport photo upload error:', error);
        return res.status(500).json({ message: 'Failed to upload passport photo: ' + error.message });
      }
    }

    if (certFile) {
      try {
        const uploadRes2 = await uploadBuffer(certFile.buffer, { 
          folder: 'doctors/certificates',
          resource_type: 'auto',
          allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (!uploadRes2 || !uploadRes2.secure_url) {
          throw new Error('Invalid response from Cloudinary upload');
        }
        console.log('Cloudinary certificate upload response:', {
          public_id: uploadRes2.public_id,
          secure_url: uploadRes2.secure_url,
          resource_type: uploadRes2.resource_type,
          format: uploadRes2.format,
          bytes: uploadRes2.bytes
        });
        doctorData.certificates = uploadRes2.secure_url;
        doctorData.certificatesPublicId = uploadRes2.public_id;
      } catch (error) {
        console.error('Certificate upload error:', error);
        return res.status(500).json({ message: 'Failed to upload certificate: ' + error.message });
      }
    }

    try {
      const doctor = await Doctor.create(doctorData);
      const token = generateToken({ id: doctor._id, role: 'doctor' });

      // Send welcome emails to doctor and contacts
      try {
        // Ensure we pass a plain object that definitely contains nominee/family fields
        const doctorObj = doctor.toObject ? doctor.toObject() : doctor;

        // Fallback to the original submitted data for any nested contacts that might not be present on the saved doc
        const contactPayload = {
          ...doctorObj,
          nominee: doctorObj.nominee && doctorObj.nominee.email ? doctorObj.nominee : (doctorData.nominee || undefined),
          familyMember1: doctorObj.familyMember1 && doctorObj.familyMember1.email ? doctorObj.familyMember1 : (doctorData.familyMember1 || undefined),
          familyMember2: doctorObj.familyMember2 && doctorObj.familyMember2.email ? doctorObj.familyMember2 : (doctorData.familyMember2 || undefined)
        };

        const emailResults = await sendWelcomeEmail(contactPayload);
        console.log('Email sending results:', emailResults);
      } catch (emailError) {
        console.error('Failed to send welcome emails:', emailError);
        // Continue with registration even if emails fail
      }

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
    } catch (dbError) {
      // Handle specific MongoDB errors
      if (dbError.code === 11000) {
        // Duplicate key error
        return res.status(409).json({
          success: false,
          message: 'A doctor with this email or phone number already exists'
        });
      }
      // Log the full error for debugging
      console.error('Error creating doctor:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create doctor account',
        error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }
  } catch (error) {
    // Log the full error for debugging
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

module.exports = router;

// GET /api/doctors
// optional query: ?status=approved|pending
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
    // For now, mark status as deceased and attach reason/disease
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

// GET /api/doctors/:id - protected, doctor or admin
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // if doctor role, allow only own id
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const doctor = await Doctor.findById(id).lean();
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    // don't send passwordHash
    delete doctor.passwordHash;
    return res.json(doctor);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/doctors/:id/profile - protected, doctor can update own profile (includes file uploads)
router.patch('/:id/profile', authMiddleware, upload.fields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'certificates', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;

    // Authorization: admin or owner
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    // Debug logging to help trace update issues
    console.log('[PROFILE UPDATE] user:', req.user ? { id: req.user.id, role: req.user.role } : null);
    console.log('[PROFILE UPDATE] body keys:', Object.keys(req.body || {}));
    console.log('[PROFILE UPDATE] files:', Object.keys(req.files || {}));


    // Track changes for notification
    const changes = [];
    const simpleFields = ['name','age','sex','qualification','phone','email','alternateMobile','houseAddress','clinicAddress'];
    for (const field of simpleFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const val = req.body[field];
        if (val !== undefined && val !== '' && doctor[field] !== val) {
          changes.push({ field, old: doctor[field], new: val });
          doctor[field] = val;
        }
      }
    }

    // Nested objects: nominee, familyMember1, familyMember2
    for (const nested of ['nominee','familyMember1','familyMember2']) {
      if (req.body[nested]) {
        try {
          const parsed = typeof req.body[nested] === 'string' ? JSON.parse(req.body[nested]) : req.body[nested];
          if (nested === 'nominee') {
            // Validate nominee bank details
            if (!parsed.bankAccountNumber || !parsed.confirmBankAccountNumber || !parsed.ifscCode || !parsed.bankHolderName) {
              return res.status(400).json({ message: 'Nominee bank details are required.' });
            }
            if (parsed.bankAccountNumber !== parsed.confirmBankAccountNumber) {
              return res.status(400).json({ message: 'Nominee account numbers do not match.' });
            }
            // Remove confirmBankAccountNumber before saving
            delete parsed.confirmBankAccountNumber;
          }
          if (!doctor[nested]) doctor[nested] = {};
          Object.keys(parsed).forEach(k => {
            if (parsed[k] !== undefined && doctor[nested][k] !== parsed[k]) {
              changes.push({ field: `${nested}.${k}`, old: doctor[nested][k], new: parsed[k] });
              doctor[nested][k] = parsed[k];
            }
          });
        } catch (e) {
          console.error(`Failed to parse ${nested}:`, e);
          return res.status(400).json({ message: `Invalid ${nested} format` });
        }
      }
    }

    // Password update
    if (req.body.password && req.body.password.length >= 6) {
      doctor.passwordHash = await bcrypt.hash(req.body.password, 10);
    }

    // File uploads
    const passportFile = req.files && req.files.passportPhoto ? req.files.passportPhoto[0] : null;
    const certFile = req.files && req.files.certificates ? req.files.certificates[0] : null;

    if (passportFile) {
      try {
        const uploadRes = await uploadBuffer(passportFile.buffer, {
          folder: 'doctors/passports',
          transformation: [{ width: 500, height: 500, crop: 'fill' }],
          resource_type: 'image'
        });
        if (uploadRes && uploadRes.secure_url) {
          doctor.passportPhoto = uploadRes.secure_url;
          doctor.passportPhotoPublicId = uploadRes.public_id;
        }
      } catch (err) {
        console.error('Passport upload error:', err);
        return res.status(500).json({ message: 'Failed to upload passport photo' });
      }
    }

    if (certFile) {
      try {
        const uploadRes = await uploadBuffer(certFile.buffer, {
          folder: 'doctors/certificates',
          resource_type: 'auto',
          allowed_formats: ['pdf','png','jpg','jpeg']
        });
        if (uploadRes && uploadRes.secure_url) {
          doctor.certificates = uploadRes.secure_url;
          doctor.certificatesPublicId = uploadRes.public_id;
        }
      } catch (err) {
        console.error('Certificate upload error:', err);
        return res.status(500).json({ message: 'Failed to upload certificate' });
      }
    }

    await doctor.save();
    const out = doctor.toObject();
    delete out.passwordHash;

    // Send notification email if there are changes
    if (changes.length > 0) {
      try {
        // Build a message listing all changes
        let changeDetails = changes.map(c => `<li><b>${c.field}</b>: <span style='color:#888'>${c.old ?? ''}</span> → <span style='color:#2D3748'>${c.new ?? ''}</span></li>`).join('');
        let html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2D3748;">Profile Updated</h2>
            <p style="color: #4A5568; font-size: 16px;">Dear Dr. ${doctor.name},</p>
            <p style="color: #4A5568; font-size: 16px;">Your profile has been updated with the following changes:</p>
            <ul style="color: #234E52; font-size: 15px;">${changeDetails}</ul>
            <p style="color: #4A5568; font-size: 16px;">If you did not make these changes, please contact support immediately.</p>
            <p style="color: #4A5568; font-size: 16px;">Best regards,<br>The Doctors Community Team</p>
          </div>
        `;
        // Send to doctor
        const { sendWelcomeEmail } = require('../utils/emailService');
        const contactPayload = {
          ...out,
          nominee: out.nominee && out.nominee.email ? out.nominee : undefined,
          familyMember1: out.familyMember1 && out.familyMember1.email ? out.familyMember1 : undefined,
          familyMember2: out.familyMember2 && out.familyMember2.email ? out.familyMember2 : undefined,
          updateNotification: {
            html,
            changes
          }
        };
        // Patch emailService.js to use updateNotification.html if present for all recipients
        await sendWelcomeEmail(contactPayload);
      } catch (err) {
        console.error('Failed to send update notification email:', err);
      }
    }
    return res.json({ success: true, message: 'Profile updated', data: out });
  } catch (error) {
    console.error('Error in /:id/profile:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// PATCH /api/doctors/:id - protected, doctor can update own profile (nominee/family details), admin can update any
// This route now accepts multipart form-data to allow updating images (passportPhoto, certificates)
router.patch('/:id', authMiddleware, upload.fields([
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'certificates', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const allowedUpdates = ['name', 'age', 'sex', 'qualification', 'phone', 'alternateMobile', 'email', 'houseAddress', 'clinicAddress', 'password', 'nominee', 'familyMember1', 'familyMember2'];
    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    // Log the received data for debugging (excluding sensitive info)
    console.log('Received update fields:', Object.keys(req.body));

    // Apply text-based updates (req.body values may be strings because of multipart)
    for (const key of Object.keys(req.body)) {
      if (!allowedUpdates.includes(key)) {
        console.log('Skipping field:', key); // Debug log
        continue;
      }
      let value = req.body[key];
      
      // Debug log
      console.log('Processing field:', key);

      // Handle nested objects (nominee, familyMember1, familyMember2)
      if (['nominee', 'familyMember1', 'familyMember2'].includes(key)) {
        try {
          const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
          // Only update fields that are provided in the request
          if (!doctor[key]) doctor[key] = {};
          Object.keys(parsedValue).forEach(field => {
            if (parsedValue[field] !== undefined) {
              doctor[key][field] = parsedValue[field];
            }
          });
          continue;
        } catch (e) {
          console.error(`Error parsing ${key}:`, e);
          return res.status(400).json({ message: `Invalid ${key} data format` });
        }
      }

      // Handle password separately
      if (key === 'password') {
        if (value && value.length >= 6) {
          const bcrypt = require('bcryptjs');
          doctor.passwordHash = await bcrypt.hash(value, 10);
        }
        continue;
      }

      // Handle regular fields
      if (value !== undefined && value !== '') {
        doctor[key] = value;
      }
    }

    // Handle file uploads if present
    const passportFile = req.files && req.files.passportPhoto ? req.files.passportPhoto[0] : null;
    const certFile = req.files && req.files.certificates ? req.files.certificates[0] : null;

    if (passportFile) {
      try {
        const uploadRes = await uploadBuffer(passportFile.buffer, {
          folder: 'doctors/passports',
          transformation: [{ width: 500, height: 500, crop: 'fill' }],
          resource_type: 'image'
        });
        if (!uploadRes || !uploadRes.secure_url) throw new Error('Invalid response from Cloudinary');
        doctor.passportPhoto = uploadRes.secure_url;
        doctor.passportPhotoPublicId = uploadRes.public_id;
        console.log('Updated passportPhoto for doctor', id, uploadRes.public_id);
      } catch (err) {
        console.error('Passport photo upload error (profile update):', err);
        return res.status(500).json({ message: 'Failed to upload passport photo', error: err.message });
      }
    }

    if (certFile) {
      try {
        const uploadRes2 = await uploadBuffer(certFile.buffer, {
          folder: 'doctors/certificates',
          resource_type: 'auto',
          allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (!uploadRes2 || !uploadRes2.secure_url) throw new Error('Invalid response from Cloudinary');
        doctor.certificates = uploadRes2.secure_url;
        doctor.certificatesPublicId = uploadRes2.public_id;
        console.log('Updated certificates for doctor', id, uploadRes2.public_id);
      } catch (err) {
        console.error('Certificate upload error (profile update):', err);
        return res.status(500).json({ message: 'Failed to upload certificate', error: err.message });
      }
    }

    await doctor.save();
    const obj = doctor.toObject();
    delete obj.passwordHash;
    return res.json(obj);
  } catch (error) {
    console.error('Error in profile update:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

