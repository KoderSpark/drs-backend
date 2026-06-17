const express = require('express');
const router = express.Router();
const multer = require('multer');
const { submitPayment, getMyPayments, getAllPayments, updatePaymentStatus, updatePayment } = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });
const cpUpload = upload.fields([{ name: 'paymentProof', maxCount: 1 }]);

router.post('/', authMiddleware, cpUpload, submitPayment);
router.get('/me', authMiddleware, getMyPayments);
router.get('/', authMiddleware, getAllPayments);
router.put('/:id/status', authMiddleware, updatePaymentStatus);
router.put('/:id', authMiddleware, cpUpload, updatePayment);

module.exports = router;
