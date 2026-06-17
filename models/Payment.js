const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  amount: { type: Number, required: true },
  date: { type: Date, required: true },
  referenceNumber: { type: String },
  paymentProof: { type: String, required: true },
  paymentProofPublicId: { type: String, required: true },
  status: { type: String, default: 'pending', enum: ['pending', 'verified', 'rejected'] },
  remarks: { type: String },
  updateHistory: [{
    updatedAt: { type: Date, default: Date.now },
    changes: [{
      field: String,
      oldValue: String,
      newValue: String
    }]
  }]
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
