const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { moderateComplaint } = require('../controllers/aiController');

router.post('/moderate', protect, moderateComplaint);

module.exports = router;