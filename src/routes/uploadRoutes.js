// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();

// Import controllers
const {
  uploadSingleFile,
  uploadMultipleFiles,
  deleteFile,
  uploadComplaintImages,
} = require('../controllers/uploadController');

// Import middleware
const { protect } = require('../middleware/authMiddleware');
const { uploadSingle, uploadMultiple, ensureMultipart } = require('../middleware/uploadMiddleware');

// Routes – clean and simple
router.post('/single', protect, ensureMultipart, uploadSingle('file'), uploadSingleFile);
router.post('/multiple', protect, ensureMultipart, uploadMultiple('files', 5), uploadMultipleFiles);
router.post('/complaint-images', protect, ensureMultipart, uploadMultiple('images', 5), uploadComplaintImages);
router.delete('/', protect, deleteFile);

module.exports = router;