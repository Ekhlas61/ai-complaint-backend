const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

// Initialize S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const S3_BUCKET = process.env.AWS_S3_BUCKET;

// Upload file to S3
const uploadFile = async (file, folder = 'uploads') => {
  try {
    const fileName = `${folder}/${Date.now()}-${path.basename(file.originalname)}`;
    
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: S3_BUCKET,
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype,
        // Remove ACL parameter for buckets with ACLs disabled
      },
    });

    const result = await upload.done();
    
    // Return presigned URL instead of public URL for private buckets
    const signedUrl = await getSignedFileUrl(fileName, 3600); // 1 hour expiry
    
    return {
      url: signedUrl,
      key: fileName,
      location: result.Location,
      etag: result.ETag,
    };
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
};

// Delete file from S3
const deleteFile = async (fileKey) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: fileKey,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('S3 Delete Error:', error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

// Get signed URL for file (if private)
const getSignedFileUrl = async (fileKey, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: fileKey,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error) {
    console.error('S3 Signed URL Error:', error);
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }
};

// Validate file type
const validateFileType = (file, allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']) => {
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
  }
};

// Validate file size (max 5MB by default)
const validateFileSize = (file, maxSize = 5 * 1024 * 1024) => {
  if (file.size > maxSize) {
    throw new Error(`File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`);
  }
};

module.exports = {
  uploadFile,
  deleteFile,
  getSignedFileUrl,
  validateFileType,
  validateFileSize,
  s3Client,
  S3_BUCKET,
};
