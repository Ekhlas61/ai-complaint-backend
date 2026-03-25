const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  createOrgAdmin,
  createDeptAdmin,
  updateOrgAdmin,
  deactivateOrgAdmin,
  getOrgAdmins,
  updateDeptAdmin,
  deactivateDeptAdmin,
  getDeptAdmins,
} = require('../controllers/userController');

// ========== SysAdmin routes (OrgAdmin management) ==========
router.post('/org-admins', protect, authorizeRoles('SysAdmin'), createOrgAdmin);
router.get('/org-admins', protect, authorizeRoles('SysAdmin'), getOrgAdmins);
router.put('/org-admins/:id', protect, authorizeRoles('SysAdmin'), updateOrgAdmin);
router.put('/org-admins/:id/deactivate', protect, authorizeRoles('SysAdmin'), deactivateOrgAdmin);

// ========== OrgAdmin routes (DeptAdmin management) ==========
router.post('/dept-admins', protect, authorizeRoles('OrgAdmin'), createDeptAdmin);
router.get('/dept-admins', protect, authorizeRoles('OrgAdmin'), getDeptAdmins);
router.put('/dept-admins/:id', protect, authorizeRoles('OrgAdmin'), updateDeptAdmin);
router.put('/dept-admins/:id/deactivate', protect, authorizeRoles('OrgAdmin'), deactivateDeptAdmin);



module.exports = router;