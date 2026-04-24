const express = require('express');
const router = express.Router();
const {
  getAssignedComplaints,
  updateComplaintStatus,
  createComplaint,
  getMyComplaints,
  addComment,
  getComments,
  getComplaintsByOrganization,
  adminOverride,
} = require('../controllers/complaintController');
const { protect } = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Citizen routes
router.post('/', protect, authorizeRoles('Citizen'), createComplaint);
router.get('/my-complaints', protect, authorizeRoles('Citizen'), getMyComplaints);

// DeptHead routes
router.get('/assigned', protect, authorizeRoles('DeptHead'), getAssignedComplaints);
router.put('/:id/status', protect, authorizeRoles('DeptHead'), updateComplaintStatus);

// OrgHead routes
router.put('/:id/override', protect, authorizeRoles('OrgHead'), adminOverride);
router.get('/organization', protect, authorizeRoles('OrgHead'), getComplaintsByOrganization);

// Comment routes 
router.post('/:id/comments', protect, authorizeRoles('DeptHead', 'OrgHead'), addComment);
router.get('/:id/comments', protect, authorizeRoles('DeptHead', 'OrgHead'), getComments);

module.exports = router;