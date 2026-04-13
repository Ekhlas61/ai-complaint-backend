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

// DeptAdmin routes
router.get('/assigned', protect, authorizeRoles('DeptAdmin'), getAssignedComplaints);
router.put('/:id/status', protect, authorizeRoles('DeptAdmin'), updateComplaintStatus);

// OrgAdmin routes
router.put('/:id/override', protect, authorizeRoles('OrgAdmin'), adminOverride);
router.get('/organization', protect, authorizeRoles('OrgAdmin'), getComplaintsByOrganization);

// Comment routes 
router.post('/:id/comments', protect,authorizeRoles('DeptAdmin','OrgAdmin'), addComment);
router.get('/:id/comments', protect,authorizeRoles('DeptAdmin','OrgAdmin'), getComments);

module.exports = router;