const express = require('express');
const router = express.Router();

const { getReportHistory } = require('../controllers/reportController');

const protect = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

const {
  createReport,
  getReports,
  getReportById,
  updateReportStatus,
  assignReport,
  addComment,
   getComments
  
} = require('../controllers/reportController');


// 🔐 Create report (any logged-in user)
router.post('/', protect, createReport);

// 👑 Get all reports (Admins only)
router.get('/', protect, authorizeRoles('DeptAdmin', 'SysAdmin'), getReports);

// 🔍 Get single report
router.get('/:id', protect, getReportById);

// 🔄 Update status
router.put('/:id/status', protect, authorizeRoles('DeptAdmin', 'SysAdmin'), updateReportStatus);


// 👑 Assign report (Admins only)
router.post('/:id/assign', protect, authorizeRoles('DeptAdmin', 'SysAdmin'), assignReport);


// 💬 Add comment
router.post('/:id/comments', protect, addComment);

// 📥 Get comments
router.get('/:id/comments', protect, getComments);

//  Get History
router.get('/:id/history', protect, getReportHistory);



module.exports = router;
