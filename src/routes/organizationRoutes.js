const express = require('express');
const router = express.Router();
const protect = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');
const {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deactivateOrganization,
  getOrganizationsForCitizen,
} = require('../controllers/organizationController');

// Citizen route 
router.get('/citizen-list', protect, authorizeRoles('Citizen'), getOrganizationsForCitizen);

// SysAdmin-only routes
router.use(protect);
router.use(authorizeRoles('SysAdmin'));

router.post('/', createOrganization);
router.get('/', getOrganizations);
router.put('/:id', updateOrganization);
router.put('/:id/deactivate', deactivateOrganization);

module.exports = router;