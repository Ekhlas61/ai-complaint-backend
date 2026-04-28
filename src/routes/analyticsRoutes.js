const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  getDeptHeadStats,
  getOrgHeadStats,
  getSysAdminStats,
  getCitizenStats,
  getOrgAdminStats,
} = require('../controllers/analyticsController');

// Citizen route (no SysAdmin auth required)
router.get('/citizen', protect, authorizeRoles('Citizen'), getCitizenStats);

// DeptHead route
router.get('/dept-head', protect, authorizeRoles('DeptHead'), getDeptHeadStats);

// OrgHead route
router.get('/org-head', protect, authorizeRoles('OrgHead'), getOrgHeadStats);

// OrgAdmin route
router.get('/org-admin', protect, authorizeRoles('OrgAdmin'), getOrgAdminStats);

// SysAdmin routes 
router.use(protect);
router.use(authorizeRoles('SysAdmin'));

router.get('/sys-admin', getSysAdminStats);

module.exports = router;