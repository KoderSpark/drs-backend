const express = require('express');
const Contact = require('../models/Contact');

const router = express.Router();

// POST /api/contacts
router.post('/', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ message: 'name, email and message are required' });
    }
    const contact = await Contact.create({ name, email, phone, message });
    return res.status(201).json(contact);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/contacts
router.get('/', async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.json(contacts);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
