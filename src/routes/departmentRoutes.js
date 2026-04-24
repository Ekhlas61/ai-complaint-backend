const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  createDepartment,
  getDepartments,
  updateDepartment,
  deactivateDepartment,
} = require('../controllers/departmentController');

// Create, update, deactivate - Only OrgAdmin 
router.post('/', protect, authorizeRoles('OrgAdmin'), createDepartment);
router.put('/:id', protect, authorizeRoles('OrgAdmin'), updateDepartment);
router.put('/:id/deactivate', protect, authorizeRoles('OrgAdmin'), deactivateDepartment);

//  View departments , both OrgAdmin and OrgHead can view 
router.get('/', protect, authorizeRoles('OrgAdmin', 'OrgHead'), getDepartments);

module.exports = router;