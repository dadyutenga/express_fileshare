const express = require('express');
const { body, validationResult } = require('express-validator');
const { File, Folder, ShareLink, Log } = require('../models');
const { authenticateJWT, requirePremium } = require('../middleware/auth');
const { uploadSingle, uploadMultiple, handleUploadError } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');
const fileService = require('../services/fileService');

const router = express.Router();

/**
 * @swagger
 * /api/files/upload:
 *   post:
 *     summary: Upload a single file
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folderId:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 */
router.post('/upload', authenticateJWT, (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  const { folderId, description, tags } = req.body;

  // Validate file size
  await fileService.validateFileSize(req.user.id, req.file.size);

  const file = await fileService.saveFile(
    req.file,
    req.user.id,
    folderId,
    { description, tags: tags ? JSON.parse(tags) : [] }
  );

  res.status(201).json({
    success: true,
    message: 'File uploaded successfully',
    file: {
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      thumbnailPath: file.thumbnailPath,
      createdAt: file.createdAt
    }
  });
}));

/**
 * @swagger
 * /api/files/upload-multiple:
 *   post:
 *     summary: Upload multiple files
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.post('/upload-multiple', authenticateJWT, (req, res, next) => {
  uploadMultiple(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No files uploaded'
    });
  }

  const { folderId, description, tags } = req.body;
  const uploadedFiles = [];

  for (const file of req.files) {
    await fileService.validateFileSize(req.user.id, file.size);

    const savedFile = await fileService.saveFile(
      file,
      req.user.id,
      folderId,
      { description, tags: tags ? JSON.parse(tags) : [] }
    );

    uploadedFiles.push({
      id: savedFile.id,
      originalName: savedFile.originalName,
      size: savedFile.size,
      mimeType: savedFile.mimeType
    });
  }

  res.status(201).json({
    success: true,
    message: `${uploadedFiles.length} files uploaded successfully`,
    files: uploadedFiles
  });
}));

/**
 * @swagger
 * /api/files/{id}/download:
 *   get:
 *     summary: Download a file
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/:id/download', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const file = await File.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!file) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  // Update download count
  file.downloadCount += 1;
  file.lastAccessed = new Date();
  await file.save();

  // Log download
  await Log.create({
    userId: req.user.id,
    action: 'file_download',
    description: `Downloaded file: ${file.originalName}`,
    category: 'file_management',
    resourceId: file.id
  });

  const fileStream = await fileService.getFileStream(file.id);

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
  res.setHeader('Content-Length', file.size);

  fileStream.pipe(res);
}));

/**
 * @swagger
 * /api/files/{id}:
 *   get:
 *     summary: Get file details
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const file = await File.findOne({
    where: { id, userId: req.user.id, isDeleted: false },
    include: [{ model: Folder, as: 'folder' }]
  });

  if (!file) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  res.json({
    success: true,
    file: {
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      description: file.description,
      tags: file.tags,
      thumbnailPath: file.thumbnailPath,
      createdAt: file.createdAt,
      downloadCount: file.downloadCount,
      viewCount: file.viewCount,
      folder: file.folder
    }
  });
}));

/**
 * @swagger
 * /api/files:
 *   get:
 *     summary: Get user's files
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 */
router.get('/', authenticateJWT, asyncHandler(async (req, res) => {
  const { folderId, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = {
    userId: req.user.id,
    isDeleted: false
  };

  if (folderId) {
    whereClause.folderId = folderId;
  }

  const { count, rows: files } = await File.findAndCountAll({
    where: whereClause,
    include: [{ model: Folder, as: 'folder' }],
    order: [['createdAt', 'DESC']],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  res.json({
    success: true,
    files: files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      thumbnailPath: file.thumbnailPath,
      createdAt: file.createdAt,
      folder: file.folder
    })),
    pagination: {
      total: count,
      page: parseInt(page),
      pages: Math.ceil(count / limit),
      limit: parseInt(limit)
    }
  });
}));

/**
 * @swagger
 * /api/files/{id}:
 *   put:
 *     summary: Update file metadata
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', authenticateJWT, [
  body('description').optional().trim(),
  body('tags').optional().isArray()
], asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { description, tags } = req.body;

  const file = await File.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!file) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  const oldValues = {
    description: file.description,
    tags: file.tags
  };

  if (description !== undefined) file.description = description;
  if (tags !== undefined) file.tags = tags;

  await file.save();

  // Log update
  await Log.create({
    userId: req.user.id,
    action: 'settings_update',
    description: `Updated file metadata: ${file.originalName}`,
    category: 'file_management',
    resourceId: file.id,
    oldValues,
    newValues: { description, tags }
  });

  res.json({
    success: true,
    message: 'File updated successfully',
    file: {
      id: file.id,
      originalName: file.originalName,
      description: file.description,
      tags: file.tags
    }
  });
}));

/**
 * @swagger
 * /api/files/{id}:
 *   delete:
 *     summary: Delete a file (soft delete)
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;

  await fileService.deleteFile(id, req.user.id);

  res.json({
    success: true,
    message: 'File deleted successfully'
  });
}));

/**
 * @swagger
 * /api/files/search:
 *   get:
 *     summary: Search files
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: mimeType
 *         schema:
 *           type: string
 *       - in: query
 *         name: folderId
 *         schema:
 *           type: string
 */
router.get('/search', authenticateJWT, asyncHandler(async (req, res) => {
  const { q, mimeType, folderId } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  const files = await fileService.searchFiles(q, req.user.id, { mimeType, folderId });

  res.json({
    success: true,
    files: files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      thumbnailPath: file.thumbnailPath,
      folder: file.folder
    }))
  });
}));

/**
 * @swagger
 * /api/files/{id}/share:
 *   post:
 *     summary: Create share link for file
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/share', authenticateJWT, [
  body('expiresAt').optional().isISO8601(),
  body('password').optional().isLength({ min: 4 }),
  body('maxDownloads').optional().isInt({ min: 1 }),
  body('permissions').optional().isIn(['read', 'write', 'admin'])
], asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { expiresAt, password, maxDownloads, permissions } = req.body;

  const file = await File.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!file) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  const shareLink = await ShareLink.create({
    userId: req.user.id,
    fileId: id,
    token: require('crypto').randomBytes(32).toString('hex'),
    expiresAt,
    password,
    maxDownloads,
    permissions: permissions || 'read'
  });

  const shareUrl = `${process.env.FRONTEND_URL}/share/${shareLink.token}`;

  // Log sharing
  await Log.create({
    userId: req.user.id,
    action: 'file_share',
    description: `Shared file: ${file.originalName}`,
    category: 'file_management',
    resourceId: file.id
  });

  res.json({
    success: true,
    message: 'Share link created successfully',
    shareLink: {
      id: shareLink.id,
      token: shareLink.token,
      url: shareUrl,
      expiresAt: shareLink.expiresAt,
      maxDownloads: shareLink.maxDownloads,
      permissions: shareLink.permissions
    }
  });
}));

module.exports = router;
