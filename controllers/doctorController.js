const bcrypt = require('bcryptjs');
const Doctor = require('../models/Doctor');
const Payment = require('../models/Payment');
const Log = require('../models/Log');
const generateToken = require('../utils/generateToken');
const { sendWelcomeEmail } = require('../utils/emailService');
const { uploadBuffer } = require('../utils/cloudinaryUpload');

// Removed sendEmailAsync wrapper as we need to await the email directly in Serverless environments

exports.registerDoctor = async (req, res) => {
  try {
    const {
      name, age, sex, qualification, phone, alternateMobile, email, password,
      houseAddress, clinicAddress, aadharNumber, nominees, familyMember1,
      familyMember2, daughters, acceptTerms, subscribeUpdates,
      paymentAmount, paymentDate, paymentReference
    } = req.body;

    const passportFile = req.files && req.files.passportPhoto ? req.files.passportPhoto[0] : null;
    const certFile = req.files && req.files.certificates ? req.files.certificates[0] : null;
    const aadharFile = req.files && req.files.aadharPhoto ? req.files.aadharPhoto[0] : null;
    const paymentProofFile = req.files && req.files.paymentProof ? req.files.paymentProof[0] : null;

    if (!name || !phone || !email || !password || !aadharNumber || !aadharFile) {
      return res.status(400).json({ message: 'name, phone, email, password, aadharNumber, and aadharPhoto are required' });
    }

    if (!paymentAmount || !paymentDate || !paymentReference || !paymentProofFile) {
      return res.status(400).json({ message: 'Payment details and payment proof screenshot are required' });
    }

    const existing = await Doctor.findOne({ $or: [{ email }, { phone }] });
    if (existing) {
      return res.status(409).json({ message: 'Doctor with this email or phone already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let nomineesArr = nominees ? (typeof nominees === 'string' ? JSON.parse(nominees) : nominees) : [];
    if (!Array.isArray(nomineesArr) || nomineesArr.length === 0) {
      return res.status(400).json({ message: 'At least one nominee is required.' });
    }
    
    let totalPercentage = 0;
    for (let i = 0; i < nomineesArr.length; i++) {
      const n = nomineesArr[i];
      if (!n || !n.bankAccountNumber || !n.ifscCode || !n.bankHolderName || !n.percentage) {
        return res.status(400).json({ message: 'All nominee fields including percentage and bank details are required.' });
      }
      if (n.confirmBankAccountNumber && n.bankAccountNumber !== n.confirmBankAccountNumber) {
        return res.status(400).json({ message: 'Nominee account numbers do not match.' });
      }
      
      const p = parseFloat(n.percentage);
      if (isNaN(p) || p <= 0) {
        return res.status(400).json({ message: 'Valid positive percentage is required.' });
      }
      totalPercentage += p;
      n.percentage = p;
      delete n.confirmBankAccountNumber;
    }

    if (Math.abs(totalPercentage - 100) > 0.01) {
      return res.status(400).json({ message: 'Total nominee percentage must equal 100.' });
    }

    const doctorData = {
      name, age, sex, qualification, phone, alternateMobile, email, passwordHash,
      passportPhoto: null, certificates: null, aadharNumber, aadharPhoto: null,
      houseAddress, clinicAddress, nominees: nomineesArr,
      familyMember1: familyMember1 ? (typeof familyMember1 === 'string' ? JSON.parse(familyMember1) : familyMember1) : undefined,
      familyMember2: familyMember2 ? (typeof familyMember2 === 'string' ? JSON.parse(familyMember2) : familyMember2) : undefined,
      daughters: daughters ? (typeof daughters === 'string' ? JSON.parse(daughters) : daughters) : [],
      acceptTerms: !!acceptTerms, subscribeUpdates: !!subscribeUpdates
    };

    if (passportFile) {
      try {
        const uploadRes = await uploadBuffer(passportFile.buffer, { 
          folder: 'doctors/passports', transformation: [{ width: 500, height: 500, crop: 'fill' }], resource_type: 'image'
        });
        if (!uploadRes || !uploadRes.secure_url) throw new Error('Invalid response');
        doctorData.passportPhoto = uploadRes.secure_url;
        doctorData.passportPhotoPublicId = uploadRes.public_id;
      } catch (error) {
        return res.status(500).json({ message: 'Failed to upload passport photo: ' + error.message });
      }
    }

    if (certFile) {
      try {
        const uploadRes2 = await uploadBuffer(certFile.buffer, { 
          folder: 'doctors/certificates', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (!uploadRes2 || !uploadRes2.secure_url) throw new Error('Invalid response');
        doctorData.certificates = uploadRes2.secure_url;
        doctorData.certificatesPublicId = uploadRes2.public_id;
      } catch (error) {
        return res.status(500).json({ message: 'Failed to upload certificate: ' + error.message });
      }
    }

    if (aadharFile) {
      try {
        const uploadRes3 = await uploadBuffer(aadharFile.buffer, { 
          folder: 'doctors/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (!uploadRes3 || !uploadRes3.secure_url) throw new Error('Invalid response');
        doctorData.aadharPhoto = uploadRes3.secure_url;
        doctorData.aadharPhotoPublicId = uploadRes3.public_id;
      } catch (error) {
        return res.status(500).json({ message: 'Failed to upload Aadhar photo: ' + error.message });
      }
    }

    // Upload nominee aadhar photos
    if (doctorData.nominees && doctorData.nominees.length > 0) {
      for (let i = 0; i < doctorData.nominees.length; i++) {
        const nominee = doctorData.nominees[i];
        const nFile = req.files && req.files[`nomineeAadharPhoto_${i}`] ? req.files[`nomineeAadharPhoto_${i}`][0] : null;
        if (nFile) {
          try {
            const uploadResN = await uploadBuffer(nFile.buffer, { 
              folder: 'doctors/nominees/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
            });
            if (!uploadResN || !uploadResN.secure_url) throw new Error('Invalid response');
            nominee.aadharPhoto = uploadResN.secure_url;
            nominee.aadharPhotoPublicId = uploadResN.public_id;
          } catch (error) {
            return res.status(500).json({ message: `Failed to upload Aadhar photo for nominee ${i + 1}: ${error.message}` });
          }
        }
      }
    }

    // Upload daughter aadhar photos
    if (doctorData.daughters && doctorData.daughters.length > 0) {
      for (let i = 0; i < doctorData.daughters.length; i++) {
        const daughter = doctorData.daughters[i];
        const dFile = req.files && req.files[`daughterAadharPhoto_${i}`] ? req.files[`daughterAadharPhoto_${i}`][0] : null;
        if (dFile) {
          try {
            const uploadResD = await uploadBuffer(dFile.buffer, { 
              folder: 'doctors/daughters/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
            });
            if (!uploadResD || !uploadResD.secure_url) throw new Error('Invalid response');
            daughter.aadharPhoto = uploadResD.secure_url;
            daughter.aadharPhotoPublicId = uploadResD.public_id;
          } catch (error) {
            return res.status(500).json({ message: `Failed to upload Aadhar photo for daughter ${i + 1}: ${error.message}` });
          }
        }
      }
    }

    // Upload family member 1 aadhar photo
    if (doctorData.familyMember1 && doctorData.familyMember1.name) {
      const fam1File = req.files && req.files.family1AadharPhoto ? req.files.family1AadharPhoto[0] : null;
      if (fam1File) {
        try {
          const uploadResF1 = await uploadBuffer(fam1File.buffer, {
            folder: 'doctors/family/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
          });
          if (!uploadResF1 || !uploadResF1.secure_url) throw new Error('Invalid response');
          doctorData.familyMember1.aadharPhoto = uploadResF1.secure_url;
          doctorData.familyMember1.aadharPhotoPublicId = uploadResF1.public_id;
        } catch (error) {
          return res.status(500).json({ message: 'Failed to upload Aadhar photo for family member 1: ' + error.message });
        }
      }
    }

    // Upload family member 2 aadhar photo
    if (doctorData.familyMember2 && doctorData.familyMember2.name) {
      const fam2File = req.files && req.files.family2AadharPhoto ? req.files.family2AadharPhoto[0] : null;
      if (fam2File) {
        try {
          const uploadResF2 = await uploadBuffer(fam2File.buffer, {
            folder: 'doctors/family/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
          });
          if (!uploadResF2 || !uploadResF2.secure_url) throw new Error('Invalid response');
          doctorData.familyMember2.aadharPhoto = uploadResF2.secure_url;
          doctorData.familyMember2.aadharPhotoPublicId = uploadResF2.public_id;
        } catch (error) {
          return res.status(500).json({ message: 'Failed to upload Aadhar photo for family member 2: ' + error.message });
        }
      }
    }

    try {
      const doctor = await Doctor.create(doctorData);

      // Upload payment proof
      let paymentProofUrl = '';
      let paymentProofPublicId = '';
      try {
        const uploadResP = await uploadBuffer(paymentProofFile.buffer, { 
          folder: 'payments', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (!uploadResP || !uploadResP.secure_url) throw new Error('Invalid response');
        paymentProofUrl = uploadResP.secure_url;
        paymentProofPublicId = uploadResP.public_id;
      } catch (error) {
        // We log the error but still proceed since the doctor was created. Ideally this should be a transaction.
        console.error('Failed to upload payment proof:', error);
      }

      // Create Payment record
      try {
        await Payment.create({
          doctorId: doctor._id,
          amount: parseFloat(paymentAmount) || 365,
          date: new Date(paymentDate),
          referenceNumber: paymentReference,
          paymentProof: paymentProofUrl,
          paymentProofPublicId: paymentProofPublicId,
          status: 'pending'
        });
      } catch (error) {
        console.error('Failed to create payment record:', error);
      }

      const token = generateToken({ id: doctor._id, role: 'doctor' });

      const doctorObj = doctor.toObject ? doctor.toObject() : doctor;
      const contactPayload = {
        ...doctorObj,
        nominees: doctorObj.nominees ? doctorObj.nominees : (doctorData.nominees || []),
        familyMember1: doctorObj.familyMember1 && doctorObj.familyMember1.email ? doctorObj.familyMember1 : (doctorData.familyMember1 || undefined),
        familyMember2: doctorObj.familyMember2 && doctorObj.familyMember2.email ? doctorObj.familyMember2 : (doctorData.familyMember2 || undefined)
      };

      // Await email dispatch so Vercel doesn't kill the background process
      await sendWelcomeEmail(contactPayload);

      return res.status(201).json({
        success: true,
        data: {
          _id: doctor._id, name: doctor.name, phone: doctor.phone, email: doctor.email
        }
      });
    } catch (dbError) {
      if (dbError.code === 11000) {
        return res.status(409).json({ success: false, message: 'A doctor with this email or phone number already exists' });
      }
      return res.status(500).json({ success: false, message: 'Failed to create doctor account', error: process.env.NODE_ENV === 'development' ? dbError.message : undefined });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error occurred during registration', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

exports.loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
    const doctor = await Doctor.findOne({ email });
    if (!doctor) return res.status(401).json({ message: 'Invalid credentials' });
    
    if (doctor.status === 'pending') {
      return res.status(403).json({ message: 'Waiting for your approval' });
    }

    const isMatch = await bcrypt.compare(password, doctor.passwordHash);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    const token = generateToken({ id: doctor._id, role: 'doctor' });
    return res.json({ _id: doctor._id, name: doctor.name, email: doctor.email, token });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getDoctors = async (req, res) => {
  try {
    const { status, page = 1, limit = 1000 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    
    // Pagination and preventing passwordHash leak
    const doctors = await Doctor.find(filter)
      .select('-passwordHash')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
      
    return res.json(doctors);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.approveDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const { disease, message } = req.body;

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    
    doctor.status = 'approved';
    doctor.approvedDisease = disease;
    doctor.approvedMessage = message || '';
    doctor.approvedDate = new Date();
    
    await doctor.save();
    
    try {
      await Log.create({
        action: 'APPROVE_DOCTOR',
        adminId: req.user.id,
        targetId: doctor._id,
        targetName: doctor.name,
        details: disease ? `Approved for disease: ${disease}` : 'Approved via Admin Dashboard',
        targetData: doctor.toObject()
      });
    } catch (logErr) { console.error('Failed to log approve action:', logErr); }
    
    const obj = doctor.toObject();
    delete obj.passwordHash;
    return res.json({ message: 'Approved', doctor: obj });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.markDeceasedDoctor = async (req, res) => {
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
    
    try {
      await Log.create({
        action: 'MARK_DECEASED',
        adminId: req.user.id,
        targetId: doctor._id,
        targetName: doctor.name,
        details: reason ? `Reason: ${reason}` : (diseaseName ? `Disease: ${diseaseName}` : 'Marked deceased via Admin Dashboard'),
        targetData: doctor.toObject()
      });
    } catch (logErr) { console.error('Failed to log deceased action:', logErr); }
    
    return res.json({ message: 'Doctor marked deceased' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteDoctor = async (req, res) => {
  try {
    const { id } = req.params;
    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    
    const name = doctor.name;
    await Doctor.findByIdAndDelete(id);
    
    try {
      await Log.create({
        action: 'DELETE_DOCTOR',
        adminId: req.user.id,
        targetId: id,
        targetName: name,
        details: 'Deleted via Admin Dashboard',
        targetData: doctor.toObject()
      });
    } catch (logErr) { console.error('Failed to log delete action:', logErr); }
    
    return res.json({ message: 'Doctor deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getDoctorById = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.role === 'doctor' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const doctor = await Doctor.findById(id).select('-passwordHash').lean();
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });
    return res.json(doctor);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateDoctor = async (req, res) => {
  try {
    const { id } = req.params;

    // Both /:id/profile and /:id hit this now. 
    // If admin is updating another profile, it's fine. If doctor is updating, must be their own id.
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const doctor = await Doctor.findById(id);
    if (!doctor) return res.status(404).json({ message: 'Doctor not found' });

    // Track changes for notification
    const changes = [];
    const allowedUpdates = [
      'name', 'age', 'sex', 'qualification', 'phone', 'alternateMobile', 
      'email', 'houseAddress', 'clinicAddress', 'aadharNumber'
    ];

    for (const field of allowedUpdates) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        const val = req.body[field];
        if (val !== undefined && val !== '' && doctor[field] !== val) {
          changes.push({ field, old: doctor[field], new: val });
          doctor[field] = val;
        }
      }
    }

    // Handle nominees array
    if (req.body.nominees) {
      try {
        let nomineesArr = typeof req.body.nominees === 'string' ? JSON.parse(req.body.nominees) : req.body.nominees;
        if (!Array.isArray(nomineesArr) || nomineesArr.length === 0) {
          return res.status(400).json({ message: 'At least one nominee is required.' });
        }
        
        let totalPercentage = 0;
        for (let i = 0; i < nomineesArr.length; i++) {
          const n = nomineesArr[i];
          if (!n || !n.bankAccountNumber || !n.ifscCode || !n.bankHolderName || !n.percentage) {
            return res.status(400).json({ message: 'All nominee fields (including percentage) and bank details are required.' });
          }
          if (n.confirmBankAccountNumber && n.bankAccountNumber !== n.confirmBankAccountNumber) {
            return res.status(400).json({ message: 'Nominee account numbers do not match.' });
          }
          
          const p = parseFloat(n.percentage);
          if (isNaN(p) || p <= 0) {
            return res.status(400).json({ message: 'Valid positive percentage is required.' });
          }
          totalPercentage += p;
          n.percentage = p;
          
          delete n.confirmBankAccountNumber;
        }

        if (Math.abs(totalPercentage - 100) > 0.01) {
          return res.status(400).json({ message: 'Total nominee percentage must equal 100.' });
        }
        
        doctor.nominees = nomineesArr;
        changes.push({ field: 'nominees', old: '...', new: '...' });
      } catch (e) {
        return res.status(400).json({ message: 'Invalid nominees format' });
      }
    }

    // Handle daughters array
    if (req.body.daughters) {
      try {
        let daughtersArr = typeof req.body.daughters === 'string' ? JSON.parse(req.body.daughters) : req.body.daughters;
        doctor.daughters = daughtersArr;
        changes.push({ field: 'daughters', old: '...', new: '...' });
      } catch (e) {
        return res.status(400).json({ message: 'Invalid daughters format' });
      }
    }

    // Nested objects: familyMember1, familyMember2
    for (const nested of ['familyMember1','familyMember2']) {
      if (req.body[nested]) {
        try {
          const parsed = typeof req.body[nested] === 'string' ? JSON.parse(req.body[nested]) : req.body[nested];
          if (!doctor[nested]) doctor[nested] = {};
          Object.keys(parsed).forEach(k => {
            if (parsed[k] !== undefined && doctor[nested][k] !== parsed[k]) {
              changes.push({ field: `${nested}.${k}`, old: doctor[nested][k], new: parsed[k] });
              doctor[nested][k] = parsed[k];
            }
          });
        } catch (e) {
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
    const aadharFile = req.files && req.files.aadharPhoto ? req.files.aadharPhoto[0] : null;

    if (passportFile) {
      try {
        const uploadRes = await uploadBuffer(passportFile.buffer, {
          folder: 'doctors/passports', transformation: [{ width: 500, height: 500, crop: 'fill' }], resource_type: 'image'
        });
        if (uploadRes && uploadRes.secure_url) {
          doctor.passportPhoto = uploadRes.secure_url;
          doctor.passportPhotoPublicId = uploadRes.public_id;
        }
      } catch (err) {
        return res.status(500).json({ message: 'Failed to upload passport photo' });
      }
    }

    if (certFile) {
      try {
        const uploadRes = await uploadBuffer(certFile.buffer, {
          folder: 'doctors/certificates', resource_type: 'auto', allowed_formats: ['pdf','png','jpg','jpeg']
        });
        if (uploadRes && uploadRes.secure_url) {
          doctor.certificates = uploadRes.secure_url;
          doctor.certificatesPublicId = uploadRes.public_id;
        }
      } catch (err) {
        return res.status(500).json({ message: 'Failed to upload certificate' });
      }
    }

    if (aadharFile) {
      try {
        const uploadRes = await uploadBuffer(aadharFile.buffer, {
          folder: 'doctors/aadhar', resource_type: 'auto', allowed_formats: ['pdf','png','jpg','jpeg']
        });
        if (uploadRes && uploadRes.secure_url) {
          doctor.aadharPhoto = uploadRes.secure_url;
          doctor.aadharPhotoPublicId = uploadRes.public_id;
        }
      } catch (err) {
        return res.status(500).json({ message: 'Failed to upload Aadhar photo' });
      }
    }

    const fam1File = req.files && req.files.family1AadharPhoto ? req.files.family1AadharPhoto[0] : null;
    if (fam1File) {
      try {
        const uploadResF1 = await uploadBuffer(fam1File.buffer, {
          folder: 'doctors/family/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (uploadResF1 && uploadResF1.secure_url) {
          if (!doctor.familyMember1) doctor.familyMember1 = {};
          doctor.familyMember1.aadharPhoto = uploadResF1.secure_url;
          doctor.familyMember1.aadharPhotoPublicId = uploadResF1.public_id;
        }
      } catch (err) {
        return res.status(500).json({ message: 'Failed to upload Aadhar photo for family member 1' });
      }
    }

    const fam2File = req.files && req.files.family2AadharPhoto ? req.files.family2AadharPhoto[0] : null;
    if (fam2File) {
      try {
        const uploadResF2 = await uploadBuffer(fam2File.buffer, {
          folder: 'doctors/family/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        if (uploadResF2 && uploadResF2.secure_url) {
          if (!doctor.familyMember2) doctor.familyMember2 = {};
          doctor.familyMember2.aadharPhoto = uploadResF2.secure_url;
          doctor.familyMember2.aadharPhotoPublicId = uploadResF2.public_id;
        }
      } catch (err) {
        return res.status(500).json({ message: 'Failed to upload Aadhar photo for family member 2' });
      }
    }

    // Upload nominee aadhar photos
    if (doctor.nominees && doctor.nominees.length > 0) {
      for (let i = 0; i < doctor.nominees.length; i++) {
        const nominee = doctor.nominees[i];
        const nFile = req.files && req.files[`nomineeAadharPhoto_${i}`] ? req.files[`nomineeAadharPhoto_${i}`][0] : null;
        if (nFile) {
          try {
            const uploadResN = await uploadBuffer(nFile.buffer, { 
              folder: 'doctors/nominees/aadhar', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
            });
            if (uploadResN && uploadResN.secure_url) {
              nominee.aadharPhoto = uploadResN.secure_url;
              nominee.aadharPhotoPublicId = uploadResN.public_id;
            }
          } catch (error) {
            return res.status(500).json({ message: `Failed to upload Aadhar photo for nominee ${i + 1}: ${error.message}` });
          }
        }
      }
    }

    await doctor.save();
    const out = doctor.toObject();
    delete out.passwordHash;

    // Determine if this was specifically the /profile endpoint call asking for notification
    const isProfileUpdate = req.path.includes('profile');

    // Send notification email if there are changes and it is a user profile update
    if (changes.length > 0 && isProfileUpdate) {
      try {
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
        const contactPayload = {
          ...out,
          nominees: out.nominees ? out.nominees : [],
          familyMember1: out.familyMember1 && out.familyMember1.email ? out.familyMember1 : undefined,
          familyMember2: out.familyMember2 && out.familyMember2.email ? out.familyMember2 : undefined,
          updateNotification: { html, changes }
        };
        await sendWelcomeEmail(contactPayload);
      } catch (err) {
        console.error('Failed to dispatch async notification email:', err);
      }
    }

    return res.json({ success: true, message: 'Profile updated', data: out, ...(isProfileUpdate ? {} : out) });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
