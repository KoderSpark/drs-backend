const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Not authorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const secret = process.env.JWT_SECRET || 'changeme';
    const decoded = jwt.verify(token, secret);
    // decoded should contain id and role
    req.user = decoded;
    // attach full doctor object for convenience if role is doctor
    if (decoded.id && decoded.role === 'doctor') {
      const doctor = await Doctor.findById(decoded.id);
      if (doctor) req.currentDoctor = doctor;
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

module.exports = authMiddleware;
