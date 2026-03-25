const express = require('express');
const router = express.Router();
const {
  getAssignedComplaints,
  updateComplaintStatus,
  createComplaint,
  getMyComplaints,
  getComplaintById,
  assignComplaint,
  addComment,
  getComments,
} = require('../controllers/complaintController');
const protect = require('../middleware/authMiddleware');
const { authorizeRoles } = require('../middleware/roleMiddleware');

// Citizen routes
router.post('/', protect, authorizeRoles('Citizen'), createComplaint);
router.get('/my-complaints', protect, authorizeRoles('Citizen'), getMyComplaints);

// DeptAdmin routes
router.get('/assigned', protect, authorizeRoles('DeptAdmin'), getAssignedComplaints);
router.put('/:id/status', protect, authorizeRoles('DeptAdmin'), updateComplaintStatus);

// OrgAdmin/SysAdmin routes
router.put('/:id/assign', protect, authorizeRoles('OrgAdmin', 'SysAdmin'), assignComplaint);

// General (role‑based access inside)
router.get('/:id', protect, getComplaintById);
// Comment routes (any authenticated user can comment – permissions checked inside)

// Comment routes (any authenticated user can comment – permissions checked inside)
router.post('/:id/comments', protect, addComment);
router.get('/:id/comments', protect, getComments);

module.exports = router;