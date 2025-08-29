const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
const path = require('path');
const crypto = require('crypto');
const { AppError } = require('./errorHandler');

// Configure AWS S3
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Local storage configuration
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${uniqueSuffix}-${file.originalname}`);
  }
});

// S3 storage configuration
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.S3_BUCKET_NAME,
  metadata: (req, file, cb) => {
    cb(null, { fieldName: file.fieldname });
  },
  key: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    cb(null, `uploads/${Date.now()}-${uniqueSuffix}-${file.originalname}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'video/avi',
    'video/mov',
    'audio/mp3',
    'audio/wav',
    'application/zip',
    'application/x-rar-compressed'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type', 400), false);
  }
};

// Single file upload
const uploadSingle = multer({
  storage: process.env.STORAGE_TYPE === 's3' ? s3Storage : localStorage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
}).single('file');

// Multiple files upload
const uploadMultiple = multer({
  storage: process.env.STORAGE_TYPE === 's3' ? s3Storage : localStorage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB per file
    files: 10 // Max 10 files
  }
}).array('files', 10);

// Profile avatar upload
const uploadAvatar = multer({
  storage: process.env.STORAGE_TYPE === 's3' ? s3Storage : localStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('Only image files are allowed for avatars', 400), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
}).single('avatar');

// Error handling middleware for multer
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 100MB.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum 10 files allowed.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field.'
      });
    }
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  next(error);
};

module.exports = {
  uploadSingle,
  uploadMultiple,
  uploadAvatar,
  handleUploadError
};
