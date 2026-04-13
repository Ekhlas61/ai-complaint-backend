const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');   
const aiController = require('../controllers/aiController');

router.post('/moderate', protect, aiController.moderateComplaint);

module.exports = router;