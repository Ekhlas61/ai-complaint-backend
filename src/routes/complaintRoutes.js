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
const { complaintAuth } = require('../middleware/casbinAuth');

// Citizen routes - Apply Casbin for create complaint
router.post('/', protect, authorizeRoles('Citizen'), complaintAuth.create, createComplaint);
router.get('/my-complaints', protect, authorizeRoles('Citizen'), getMyComplaints);

// DeptHead routes - Apply Casbin for update status and assign
router.get('/assigned', protect, authorizeRoles('DeptHead'), getAssignedComplaints);
router.put('/:id/status', protect, authorizeRoles('DeptHead'), complaintAuth.updateStatus, updateComplaintStatus);

// OrgHead routes - Apply Casbin for override
router.put('/:id/override', protect, authorizeRoles('OrgHead'), complaintAuth.override, adminOverride);
router.get('/organization', protect, authorizeRoles('OrgHead'), getComplaintsByOrganization);

// Comment routes - Apply Casbin for comment operations
router.post('/:id/comments', protect, authorizeRoles('DeptHead', 'OrgHead'), complaintAuth.comment, addComment);
router.get('/:id/comments', protect, authorizeRoles('DeptHead', 'OrgHead'), getComments);

module.exports = router;