const express = require('express');
const router = express.Router();

const {
  createDepartment,
  getDepartments,
  updateDepartment,
  deactivateDepartment,
  // later: activateDepartment, deleteDepartment (hard delete if needed)
} = require('../controllers/departmentController');

const  protect  = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// ────────────────────────────────────────────────
// OrgAdmin routes (protected)
// ────────────────────────────────────────────────

// Create a new department
router.post(
  '/',
  protect,
  authorizeRoles('OrgAdmin'),
  createDepartment
);

// List all active departments (with head populated if exists)
router.get(
  '/',
  protect,
  authorizeRoles('OrgAdmin'),
  getDepartments
);

// Update department details (name, code, description, head)
router.put(
  '/:id',
  protect,
  authorizeRoles('OrgAdmin'),
  updateDepartment
);

// Soft-deactivate (set isActive: false)
router.put(
  '/:id/deactivate',
  protect,
  authorizeRoles('OrgAdmin'),
  deactivateDepartment
);

// Optional future: reactivate
// router.put('/:id/activate', protect, authorize('OrgAdmin'), activateDepartment);

module.exports = router;