const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number },
    sex: { type: String },
    qualification: { type: String },
    phone: { type: String, required: true, trim: true, unique: true },
    alternateMobile: { type: String },
    email: { type: String, required: true, trim: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    passportPhoto: { type: String },
  passportPhotoPublicId: { type: String },
  certificates: { type: String },
  certificatesPublicId: { type: String },
    houseAddress: { type: String },
    clinicAddress: { type: String },
    nominee: {
      name: { type: String },
      age: { type: Number },
      sex: { type: String },
      email: { type: String },
      phone: { type: String },
      bankAccountNumber: { type: String, required: true },
      ifscCode: { type: String, required: true },
      bankHolderName: { type: String, required: true }
    },
    familyMember1: {
      name: { type: String },
      age: { type: Number },
      sex: { type: String },
      email: { type: String },
      mobile: { type: String },
      address: { type: String }
    },
    familyMember2: {
      name: { type: String },
      age: { type: Number },
      sex: { type: String },
      email: { type: String },
      mobile: { type: String },
      address: { type: String }
    },
    acceptTerms: { type: Boolean, default: false },
    subscribeUpdates: { type: Boolean, default: false },
    status: { type: String, default: 'pending' },
    approvedDisease: { type: String },
    approvedMessage: { type: String },
    approvedDate: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Doctor', doctorSchema);
