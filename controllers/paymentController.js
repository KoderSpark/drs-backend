const Payment = require('../models/Payment');
const { uploadBuffer } = require('../utils/cloudinaryUpload');

exports.submitPayment = async (req, res) => {
  try {
    const { amount, date, referenceNumber, doctorId } = req.body;
    const proofFile = req.files && req.files.paymentProof ? req.files.paymentProof[0] : null;

    if (!amount || !date || !proofFile || !doctorId) {
      return res.status(400).json({ message: 'Amount, date, payment proof, and member selection are required' });
    }

    let paymentProof = '';
    let paymentProofPublicId = '';

    try {
      const uploadRes = await uploadBuffer(proofFile.buffer, {
        folder: 'payments/proofs', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
      });
      paymentProof = uploadRes.secure_url;
      paymentProofPublicId = uploadRes.public_id;
    } catch (err) {
      return res.status(500).json({ message: 'Failed to upload payment proof: ' + err.message });
    }

    const payment = await Payment.create({
      doctorId,
      amount,
      date,
      referenceNumber,
      paymentProof,
      paymentProofPublicId
    });

    return res.status(201).json({ message: 'Payment submitted successfully', payment });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getMyPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ doctorId: req.user.id }).sort({ createdAt: -1 });
    return res.json(payments);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find().populate('doctorId', 'name email phone').sort({ createdAt: -1 });
    return res.json(payments);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    if (status) payment.status = status;
    if (remarks !== undefined) payment.remarks = remarks;

    await payment.save();
    return res.json({ message: 'Payment updated', payment });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, date, referenceNumber } = req.body;
    const proofFile = req.files && req.files.paymentProof ? req.files.paymentProof[0] : null;

    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    // Ensure only the original doctor or admin can edit
    if (payment.doctorId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to edit this payment' });
    }

    const changes = [];

    if (amount && Number(amount) !== payment.amount) {
      changes.push({ field: 'amount', oldValue: String(payment.amount), newValue: String(amount) });
      payment.amount = Number(amount);
    }
    if (date) {
      const oldDate = new Date(payment.date).toISOString().split('T')[0];
      const newDate = new Date(date).toISOString().split('T')[0];
      if (oldDate !== newDate) {
        changes.push({ field: 'date', oldValue: oldDate, newValue: newDate });
        payment.date = date;
      }
    }
    if (referenceNumber !== undefined && referenceNumber !== payment.referenceNumber) {
      changes.push({ field: 'referenceNumber', oldValue: payment.referenceNumber || 'None', newValue: referenceNumber || 'None' });
      payment.referenceNumber = referenceNumber;
    }

    if (proofFile) {
      try {
        const uploadRes = await uploadBuffer(proofFile.buffer, {
          folder: 'payments/proofs', resource_type: 'auto', allowed_formats: ['pdf', 'png', 'jpg', 'jpeg']
        });
        changes.push({ field: 'paymentProof', oldValue: 'Previous Document', newValue: 'New Document Uploaded' });
        payment.paymentProof = uploadRes.secure_url;
        payment.paymentProofPublicId = uploadRes.public_id;
      } catch (err) {
        return res.status(500).json({ message: 'Failed to upload new payment proof: ' + err.message });
      }
    }

    if (changes.length > 0) {
      payment.updateHistory.push({
        updatedAt: new Date(),
        changes
      });
      // Reset status to pending if edited by the user
      if (req.user.role !== 'admin') {
        payment.status = 'pending';
      }
      await payment.save();
      return res.json({ message: 'Payment updated successfully', payment });
    } else {
      return res.status(400).json({ message: 'No changes provided' });
    }

  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
