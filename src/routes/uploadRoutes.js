// routes/uploadRoutes.js
const express = require('express');
const router = express.Router();

// Import controllers
const {
  uploadMedia,
  deleteFile
} = require('../controllers/uploadController');

// Import middleware
const { protect } = require('../middleware/authMiddleware');
const { uploadMultiple, ensureMultipart } = require('../middleware/uploadMiddleware');

// Universal Route – Handles 1 to 5 images under the "files" field
router.post('/', protect, ensureMultipart, uploadMultiple('files', 5), uploadMedia);

// Route for deleting images
router.delete('/', protect, deleteFile);

module.exports = router;