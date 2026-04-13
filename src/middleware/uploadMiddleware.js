
const multer = require('multer');
const { validateFileType } = require('../utils/s3Service');

// Multer memory storage 
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  try {
    console.log(`Processing file: ${file.originalname}, type: ${file.mimetype}`);
    validateFileType(file);
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

// Multer instance with all limits
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5,
    fieldSize: 1024 * 1024,    // 1MB for form fields
    fields: 10,
    parts: 15
  },
  fileLimit: 5,
  keepExtensions: true,
  abortOnLimitError: false
});

// Central error handler for multer and multipart issues
const handleMulterError = (error, req, res, next) => {
  if (!error) return next();

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({ message: 'File too large. Maximum size is 5MB' });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({ message: 'Too many files. Maximum is 5 files' });
      case 'LIMIT_FIELD_KEY':
      case 'LIMIT_FIELD_VALUE':
        return res.status(400).json({ message: 'Form field too large or invalid' });
      default:
        return res.status(400).json({ message: `Multer error: ${error.message}` });
    }
  }
  
  if (error.message && error.message.includes('Unexpected end of form')) {
    console.error('Malformed multipart/form-data detected');
    return res.status(400).json({
      message: 'Invalid or incomplete form data. Please ensure your file is properly uploaded.',
      details: 'Send a valid image file (JPEG, PNG, GIF) with proper multipart form data.'
    });
  }

  if (error.message && error.message.includes('Multipart: Boundary not found')) {
    console.error('Multipart boundary missing');
    return res.status(400).json({
      message: 'Missing multipart boundary in request.',
      details: 'Do not set Content-Type manually. Use FormData (the client sets it automatically with boundary).'
    });
  }
  
  next(error);
};


const ensureMultipart = (req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({
      message: 'Invalid Content-Type. Use multipart/form-data for file uploads.',
      details: `Received: ${contentType || 'none'}`
    });
  }
  if (!/boundary=/.test(contentType)) {
    console.error('Missing boundary in Content-Type header');
    return res.status(400).json({
      message: 'Missing multipart boundary in Content-Type header.',
      details: 'Let the client library (FormData) set the header automatically.'
    });
  }
  next();
};


const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      handleMulterError(err, req, res, next);
    });
  };
};

const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      handleMulterError(err, req, res, next);
    });
  };
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  ensureMultipart,
  handleMulterError   
};