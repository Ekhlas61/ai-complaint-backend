const multer = require('multer');
const { validateFileType, validateFileSize } = require('../utils/s3Service');

// Configure multer for memory storage (files will be uploaded to S3)
const storage = multer.memoryStorage();

// File filter for images only
const fileFilter = (req, file, cb) => {
  try {
    validateFileType(file);
    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

// Configure multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5, // Maximum 5 files at once
  },
});

// Single file upload middleware
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const singleUpload = upload.single(fieldName);
    
    singleUpload(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
          }
          if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ message: 'Too many files. Maximum is 5 files.' });
          }
          if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ message: `Unexpected field: ${error.field}` });
          }
        }
        
        if (error.message.includes('Invalid file type')) {
          return res.status(400).json({ message: error.message });
        }
        
        return res.status(400).json({ message: `Upload error: ${error.message}` });
      }
      
      next();
    });
  };
};

// Multiple files upload middleware
const uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    const multipleUpload = upload.array(fieldName, maxCount);
    
    multipleUpload(req, res, (error) => {
      if (error) {
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'File too large. Maximum size is 5MB.' });
          }
          if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({ message: `Too many files. Maximum is ${maxCount} files.` });
          }
          if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ message: `Unexpected field: ${error.field}` });
          }
        }
        
        if (error.message.includes('Invalid file type')) {
          return res.status(400).json({ message: error.message });
        }
        
        return res.status(400).json({ message: `Upload error: ${error.message}` });
      }
      
      next();
    });
  };
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  upload, // Export the base multer instance for advanced usage
};
