const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');   
const { authorizeRoles } = require('../middleware/roleMiddleware');
const aiController = require('../controllers/aiController');


router.post('/moderate', protect, aiController.moderateComplaint);

router.get('/provider-stats', protect, authorizeRoles('SysAdmin'), aiController.getAIProviderStats);

module.exports = router;