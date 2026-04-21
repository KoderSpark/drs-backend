const express = require('express');
const Visitor = require('../models/Visitor');

const router = express.Router();

async function getOrCreateVisitorDoc() {
  let visitor = await Visitor.findOne().sort({ createdAt: 1 });
  if (!visitor) {
    visitor = await Visitor.create({ count: 0 });
  }

  // Keep the earliest record as canonical and clean up duplicates if they exist.
  await Visitor.deleteMany({ _id: { $ne: visitor._id } });
  return visitor;
}

// POST /api/visitor/visit
router.post('/visit', async (_req, res) => {
  try {
    const current = await getOrCreateVisitorDoc();
    const visitor = await Visitor.findByIdAndUpdate(
      current._id,
      { $inc: { count: 1 } },
      { new: true }
    );
    return res.json({ count: visitor ? visitor.count : 0 });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/visitor/count
router.get('/count', async (_req, res) => {
  try {
    const visitor = await getOrCreateVisitorDoc();
    return res.json({ count: visitor.count });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
