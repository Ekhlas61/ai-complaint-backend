const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.use(auditLogController.isSysAdmin);


router.get('/activities', auditLogController.getAdminActivities);  
router.get('/summary', auditLogController.getAdminSummary);


module.exports = router;