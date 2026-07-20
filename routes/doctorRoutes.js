const express = require('express');
const multer = require('multer');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const doctorController = require('../controllers/doctorController');

// use memory storage so we can upload buffer to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({ storage });

const uploadFields = upload.fields([
  { name: 'paymentProof', maxCount: 1 },
  { name: 'passportPhoto', maxCount: 1 },
  { name: 'certificates', maxCount: 1 },
  { name: 'aadharPhoto', maxCount: 1 },
  { name: 'family1AadharPhoto', maxCount: 1 },
  { name: 'family2AadharPhoto', maxCount: 1 },
  { name: 'daughterAadharPhoto_0', maxCount: 1 },
  { name: 'daughterAadharPhoto_1', maxCount: 1 },
  { name: 'daughterAadharPhoto_2', maxCount: 1 },
  { name: 'daughterAadharPhoto_3', maxCount: 1 },
  { name: 'daughterAadharPhoto_4', maxCount: 1 },
  { name: 'nomineeAadharPhoto_0', maxCount: 1 },
  { name: 'nomineeAadharPhoto_1', maxCount: 1 },
  { name: 'nomineeAadharPhoto_2', maxCount: 1 }
]);

// Public Routes
router.post('/register', uploadFields, doctorController.registerDoctor);
router.post('/login', doctorController.loginDoctor);
router.get('/', doctorController.getDoctors); // GET /api/doctors (optional ?status=&page=&limit=)

// Admin/Approval Routes
router.patch('/:id/approve', doctorController.approveDoctor);
router.post('/:id/deceased', doctorController.markDeceasedDoctor);

// Protected Routes
router.get('/:id', authMiddleware, doctorController.getDoctorById);

// Update Profile (Admin or self)
router.patch('/:id/profile', authMiddleware, uploadFields, doctorController.updateDoctor);
router.patch('/:id', authMiddleware, uploadFields, doctorController.updateDoctor);

// Delete Profile
router.delete('/:id', authMiddleware, doctorController.deleteDoctor);

module.exports = router;
