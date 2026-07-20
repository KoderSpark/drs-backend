const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: ['APPROVE_DOCTOR', 'MARK_DECEASED', 'DELETE_DOCTOR', 'OTHER']
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  targetName: {
    type: String,
    required: true
  },
  details: {
    type: String,
    default: ''
  },
  targetData: {
    type: Object,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Log', logSchema);
