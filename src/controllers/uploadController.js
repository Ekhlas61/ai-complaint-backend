const { uploadFile, deleteFile: deleteS3File } = require('../utils/s3Service');

// Upload single file
exports.uploadSingleFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    const folder = req.body.folder || 'general';
    const uploadResult = await uploadFile(req.file, folder);

    res.status(200).json({
      message: 'File uploaded successfully',
      file: {
        url: uploadResult.url,
        key: uploadResult.key,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload file' });
  }
};

// Upload multiple files
exports.uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files provided' });
    }

    const folder = req.body.folder || 'general';
    const uploadPromises = req.files.map(file => uploadFile(file, folder));
    const uploadResults = await Promise.all(uploadPromises);

    const uploadedFiles = uploadResults.map((result, index) => ({
      url: result.url,
      key: result.key,
      originalName: req.files[index].originalname,
      size: req.files[index].size,
      mimetype: req.files[index].mimetype,
    }));

    res.status(200).json({
      message: 'Files uploaded successfully',
      files: uploadedFiles,
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload files' });
  }
};

// Delete file
exports.deleteFile = async (req, res) => {
  try {
    const { fileKey } = req.body;

    if (!fileKey) {
      return res.status(400).json({ message: 'File key is required' });
    }

    await deleteS3File(fileKey);

    res.status(200).json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ message: error.message || 'Failed to delete file' });
  }
};

// Upload images specifically for complaints
exports.uploadComplaintImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No images provided' });
    }

    const complaintId = req.body.complaintId || 'unknown';
    const folder = `complaints/${complaintId}`;

    const uploadPromises = req.files.map(file => uploadFile(file, folder));
    const uploadResults = await Promise.all(uploadPromises);

    const uploadedImages = uploadResults.map((result, index) => ({
      url: result.url,
      key: result.key,
      originalName: req.files[index].originalname,
      size: req.files[index].size,
      mimetype: req.files[index].mimetype,
    }));

    res.status(200).json({
      message: 'Complaint images uploaded successfully',
      images: uploadedImages,
    });
  } catch (error) {
    console.error('Complaint images upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload complaint images' });
  }
};
