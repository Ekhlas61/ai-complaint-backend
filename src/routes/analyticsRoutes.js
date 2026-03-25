const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  getDeptAdminStats,
  getOrgAdminStats,
  getSysAdminStats
} = require('../controllers/analyticsController');

router.get('/dept-admin', protect, authorizeRoles('DeptAdmin'), getDeptAdminStats);
router.get('/org-admin', protect, authorizeRoles('OrgAdmin'), getOrgAdminStats);
router.get('/sys-admin', protect, authorizeRoles('SysAdmin'), getSysAdminStats);

module.exports = router;