const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  getDeptHeadStats,
  getOrgHeadStats,
  getSysAdminStats,
  getCitizenStats,
} = require('../controllers/analyticsController');

// DeptHead routes
router.get(
  '/dept-head',
  protect,
  authorizeRoles('DeptHead'),
  getDeptHeadStats
);

// OrgHead routes
router.get(
  '/org-head',
  protect,
  authorizeRoles('OrgHead'),
  getOrgHeadStats
);

// SysAdmin routes
router.get(
  '/sys-admin',
  protect,
  authorizeRoles('SysAdmin'),
  getSysAdminStats
);

// Citizen routes
router.get(
  '/citizen',
  protect,
  authorizeRoles('Citizen'),
  getCitizenStats
);

module.exports = router;