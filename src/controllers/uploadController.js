const { uploadFile, deleteFile: deleteS3File } = require('../utils/s3Service');

// Universal upload handler for both single and multiple files
exports.uploadMedia = async (req, res) => {
  try {
    let filesToUpload = [];

    // The middleware will populate req.files if it's an array
    if (req.files && req.files.length > 0) {
      filesToUpload = req.files;
    } else if (req.file) { // Fallback just in case
      filesToUpload = [req.file];
    }

    if (filesToUpload.length === 0) {
      return res.status(400).json({ message: 'No file(s) provided' });
    }

    // Determine target folder based on provided body variables
    const folder = req.body.complaintId 
      ? `complaints/${req.body.complaintId}` 
      : (req.body.folder || 'general');

    const uploadPromises = filesToUpload.map(file => uploadFile(file, folder));
    const uploadResults = await Promise.all(uploadPromises);

    const uploadedFiles = uploadResults.map((result, index) => ({
      url: result.url,
      key: result.key,
      originalName: filesToUpload[index].originalname,
      size: filesToUpload[index].size,
      mimetype: filesToUpload[index].mimetype,
    }));

    res.status(200).json({
      message: 'File(s) uploaded successfully',
      files: uploadedFiles,
      urls: uploadedFiles.map(f => f.url)
    });
  } catch (error) {
    console.error('Universal upload error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload file(s)' });
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
