const express = require('express');
const router = express.Router();
const cloudinary = require('../config/cloudinary');

router.get('/cloudinary', (req, res) => {
  try {
    const cfg = cloudinary.config ? cloudinary.config() : {};
    return res.json({ configured: !!cloudinary.__configured, cloud_name: cfg.cloud_name || null });
  } catch (err) {
    return res.status(500).json({ configured: false, error: err.message });
  }
});

module.exports = router;
