const Log = require('../models/Log');

exports.getLogs = async (req, res) => {
  try {
    const logs = await Log.find({})
      .populate('adminId', 'name email')
      .sort({ createdAt: -1 })
      .limit(500); // Limit to recent 500 for performance
    return res.json(logs);
  } catch (error) {
    return res.status(500).json({ message: 'Server error fetching logs', error: error.message });
  }
};
