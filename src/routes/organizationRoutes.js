const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deactivateOrganization,
} = require('../controllers/organizationController');

// All routes require SysAdmin role
router.use(protect);
router.use(authorizeRoles('SysAdmin'));

router.post('/', createOrganization);
router.get('/', getOrganizations);
router.put('/:id', updateOrganization);
router.put('/:id/deactivate', deactivateOrganization);

module.exports = router;