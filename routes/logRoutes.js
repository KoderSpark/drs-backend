const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getLogs } = require('../controllers/logController');

router.get('/', authMiddleware, getLogs);

module.exports = router;
