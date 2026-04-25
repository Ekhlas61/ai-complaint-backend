const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  createOrgAdmin,
  getOrgAdmins,
  updateOrgAdmin,
  deactivateOrgAdmin,
  createOrgHead,
  getOrgHeads,
  updateOrgHead,
  deactivateOrgHead,
  createDeptHead,
  getDeptHeads,
  updateDeptHead,
  deactivateDeptHead,
} = require('../controllers/userController');

// ========== SysAdmin routes (OrgAdmin management) ==========
router.post('/org-admins', protect, authorizeRoles('SysAdmin'), createOrgAdmin);
router.get('/org-admins', protect, authorizeRoles('SysAdmin'), getOrgAdmins);
router.put('/org-admins/:id', protect, authorizeRoles('SysAdmin'), updateOrgAdmin);
router.put('/org-admins/:id/deactivate', protect, authorizeRoles('SysAdmin'), deactivateOrgAdmin);

// ========== SysAdmin routes (OrgHead management) ==========
router.post('/org-heads', protect, authorizeRoles('SysAdmin'), createOrgHead);
router.get('/org-heads', protect, authorizeRoles('SysAdmin'), getOrgHeads);
router.put('/org-heads/:id', protect, authorizeRoles('SysAdmin'), updateOrgHead);
router.put('/org-heads/:id/deactivate', protect, authorizeRoles('SysAdmin'), deactivateOrgHead);

// ========== DeptHead management ==========
// Create, update, deactivate - only OrgAdmin
router.post('/dept-heads', protect, authorizeRoles('OrgAdmin'), createDeptHead);
router.put('/dept-heads/:id', protect, authorizeRoles('OrgAdmin'), updateDeptHead);
router.put('/dept-heads/:id/deactivate', protect, authorizeRoles('OrgAdmin'), deactivateDeptHead);

// View DeptHeads - Both OrgAdmin and OrgHead can view
router.get('/dept-heads', protect, authorizeRoles('OrgAdmin', 'OrgHead'), getDeptHeads);

module.exports = router;