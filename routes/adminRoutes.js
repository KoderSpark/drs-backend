const express = require('express');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const generateToken = require('../utils/generateToken');

const router = express.Router();

// POST /api/admin/register
// This endpoint is intended for manual setup or via Postman. Frontend will use only /api/admin/login.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'name, email and password are required' });
    const existing = await Admin.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Admin with this email already exists' });
    // if phone provided, ensure it's not already used
    if (phone) {
      const p = await Admin.findOne({ phone });
      if (p) return res.status(409).json({ message: 'Admin with this phone already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const adminData = { name, email, passwordHash };
    if (phone) adminData.phone = phone;
    const admin = await Admin.create(adminData);
    const token = generateToken({ id: admin._id, role: 'admin' });
    return res.status(201).json({ _id: admin._id, name: admin.name, email: admin.email, token });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(401).json({ message: 'Invalid credentials' });
    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });
    const token = generateToken({ id: admin._id, role: 'admin' });
    return res.json({ _id: admin._id, name: admin.name, email: admin.email, token });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
