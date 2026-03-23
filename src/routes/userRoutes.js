const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  createOrgAdmin,
  createDeptAdmin,
  listUsers,
} = require('../controllers/userController');

// SysAdmin only
router.post('/org-admins', protect, authorizeRoles('SysAdmin'), createOrgAdmin);

// OrgAdmin only
router.post('/dept-admins', protect, authorizeRoles('OrgAdmin'), createDeptAdmin);

// Both SysAdmin and OrgAdmin can list users (different filters)
router.get('/', protect, authorizeRoles('SysAdmin', 'OrgAdmin'), listUsers);

module.exports = router;