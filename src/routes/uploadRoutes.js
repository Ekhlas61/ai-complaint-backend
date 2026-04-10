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
const multer = require('multer');
const { validateFileType } = require('../utils/s3Service');

// Configure multer with better error handling
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  try {
    console.log('Processing file:', file.originalname, 'Mimetype:', file.mimetype);
    validateFileType(file);
    cb(null, true);
  } catch (error) {
    console.log('File validation error:', error.message);
    cb(error, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5,
    fieldSize: 1024 * 1024, // 1MB for form fields
    fields: 10, // Max 10 fields
    parts: 15 // Max 15 parts (files + fields)
  },
  // Add error handling for malformed multipart data
  fileLimit: 5,
  keepExtensions: true,
  // Handle malformed form data gracefully
  abortOnLimitError: false
});

// Add error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 5MB' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum is 5 files' });
    }
    if (error.code === 'LIMIT_FIELD_KEY' || error.code === 'LIMIT_FIELD_VALUE') {
      return res.status(400).json({ message: 'Form field too large or invalid' });
    }
    return res.status(400).json({ message: `Multer error: ${error.message}` });
  }
  
  if (error.message && error.message.includes('Unexpected end of form')) {
    console.error('Malformed multipart/form-data detected. Headers:', req.headers);
    return res.status(400).json({ 
      message: 'Invalid or incomplete form data. Please ensure your file is properly uploaded and try again.',
      details: 'Make sure you are sending a valid image file (JPEG, PNG, GIF) with proper multipart form data.'
    });
  }

  if (error.message && error.message.includes('Multipart: Boundary not found')) {
    console.error('Multipart boundary missing. Headers:', req.headers);
    return res.status(400).json({
      message: 'Missing multipart boundary in request.',
      details: 'Do not set Content-Type manually. Use FormData (let the client set Content-Type including boundary).'
    });
  }
  
  next(error);
};

// Ensure incoming requests are multipart/form-data
const ensureMultipart = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({
      message: 'Invalid Content-Type. Use multipart/form-data for file uploads.',
      details: `Received Content-Type: ${contentType || 'none'}`
    });
  }
  // Ensure the Content-Type header includes a boundary parameter (required by busboy)
  if (!/boundary=/.test(contentType)) {
    console.error('Missing multipart boundary in Content-Type header:', contentType, 'Headers:', req.headers);
    return res.status(400).json({
      message: 'Missing multipart boundary in Content-Type header.',
      details: 'Do not set Content-Type manually; let the client/library (FormData) set it so a boundary is included.'
    });
  }
  next();
};

// Routes with error handling
router.post('/single', 
  protect, 
  ensureMultipart,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      handleMulterError(err, req, res, next);
    });
  }, 
  uploadSingleFile
);

router.post('/multiple', 
  protect, 
  ensureMultipart,
  (req, res, next) => {
    upload.array('files', 5)(req, res, (err) => {
      handleMulterError(err, req, res, next);
    });
  }, 
  uploadMultipleFiles
);

router.post('/complaint-images', 
  protect, 
  ensureMultipart,
  (req, res, next) => {
    upload.array('images', 5)(req, res, (err) => {
      handleMulterError(err, req, res, next);
    });
  }, 
  uploadComplaintImages
);

router.delete('/', protect, deleteFile);

module.exports = router;
