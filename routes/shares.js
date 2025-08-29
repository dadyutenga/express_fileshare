const express = require('express');
const { body, validationResult } = require('express-validator');
const { ShareLink, File, Folder, User, Log } = require('../models');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const fileService = require('../services/fileService');

const router = express.Router();

/**
 * @swagger
 * /api/shares/{token}:
 *   get:
 *     summary: Get share link details
 *     tags: [Shares]
 */
router.get('/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;

  const shareLink = await ShareLink.findOne({
    where: { token },
    include: [
      { model: File, as: 'file' },
      { model: Folder, as: 'folder' },
      { model: User, as: 'creator', attributes: ['id', 'name', 'email'] }
    ]
  });

  if (!shareLink) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found'
    });
  }

  if (!shareLink.canDownload()) {
    return res.status(410).json({
      success: false,
      message: 'Share link has expired or reached download limit'
    });
  }

  // Record access
  await shareLink.recordAccess(req.ip);

  const resource = shareLink.file || shareLink.folder;

  res.json({
    success: true,
    share: {
      id: shareLink.id,
      token: shareLink.token,
      expiresAt: shareLink.expiresAt,
      maxDownloads: shareLink.maxDownloads,
      downloadCount: shareLink.downloadCount,
      permissions: shareLink.permissions,
      hasPassword: !!shareLink.password,
      resource: {
        type: shareLink.file ? 'file' : 'folder',
        id: resource.id,
        name: shareLink.file ? resource.originalName : resource.name,
        size: shareLink.file ? resource.size : null,
        mimeType: shareLink.file ? resource.mimeType : null,
        description: resource.description
      },
      creator: shareLink.creator
    }
  });
}));

/**
 * @swagger
 * /api/shares/{token}/access:
 *   post:
 *     summary: Access protected share link
 *     tags: [Shares]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 */
router.post('/:token/access', [
  body('password').exists()
], asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  const shareLink = await ShareLink.findOne({
    where: { token },
    include: [
      { model: File, as: 'file' },
      { model: Folder, as: 'folder' }
    ]
  });

  if (!shareLink) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found'
    });
  }

  if (!shareLink.password) {
    return res.status(400).json({
      success: false,
      message: 'Share link is not password protected'
    });
  }

  const bcrypt = require('bcryptjs');
  const isValidPassword = await bcrypt.compare(password, shareLink.password);

  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid password'
    });
  }

  // Mark as verified for this session
  req.shareVerified = true;

  res.json({
    success: true,
    message: 'Access granted'
  });
}));

/**
 * @swagger
 * /api/shares/{token}/download:
 *   get:
 *     summary: Download shared file
 *     tags: [Shares]
 */
router.get('/:token/download', optionalAuth, asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;

  const shareLink = await ShareLink.findOne({
    where: { token },
    include: [{ model: File, as: 'file' }]
  });

  if (!shareLink || !shareLink.file) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found or invalid'
    });
  }

  if (!shareLink.canDownload()) {
    return res.status(410).json({
      success: false,
      message: 'Share link has expired or reached download limit'
    });
  }

  // Check password if required
  if (shareLink.password) {
    if (!password) {
      return res.status(401).json({
        success: false,
        message: 'Password required'
      });
    }

    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, shareLink.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
  }

  // Check permissions
  if (shareLink.permissions === 'admin' && (!req.user || req.user.id !== shareLink.userId)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  // Record download
  await shareLink.recordDownload();

  // Log download
  if (req.user) {
    await Log.create({
      userId: req.user.id,
      action: 'file_download',
      description: `Downloaded shared file: ${shareLink.file.originalName}`,
      category: 'file_management',
      resourceId: shareLink.file.id
    });
  }

  const fileStream = await fileService.getFileStream(shareLink.file.id);

  res.setHeader('Content-Type', shareLink.file.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${shareLink.file.originalName}"`);
  res.setHeader('Content-Length', shareLink.file.size);

  fileStream.pipe(res);
}));

/**
 * @swagger
 * /api/shares/{token}/folder:
 *   get:
 *     summary: Get shared folder contents
 *     tags: [Shares]
 */
router.get('/:token/folder', optionalAuth, asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;

  const shareLink = await ShareLink.findOne({
    where: { token },
    include: [
      {
        model: Folder,
        as: 'folder',
        include: [
          { model: File, as: 'files', where: { isDeleted: false }, required: false },
          { model: Folder, as: 'children', where: { isDeleted: false }, required: false }
        ]
      }
    ]
  });

  if (!shareLink || !shareLink.folder) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found or invalid'
    });
  }

  if (!shareLink.canDownload()) {
    return res.status(410).json({
      success: false,
      message: 'Share link has expired or reached download limit'
    });
  }

  // Check password if required
  if (shareLink.password) {
    if (!password) {
      return res.status(401).json({
        success: false,
        message: 'Password required'
      });
    }

    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, shareLink.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
  }

  // Check permissions
  if (shareLink.permissions === 'admin' && (!req.user || req.user.id !== shareLink.userId)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied'
    });
  }

  // Record access
  await shareLink.recordAccess(req.ip);

  res.json({
    success: true,
    folder: {
      id: shareLink.folder.id,
      name: shareLink.folder.name,
      description: shareLink.folder.description,
      files: shareLink.folder.files.map(file => ({
        id: file.id,
        originalName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        thumbnailPath: file.thumbnailPath,
        createdAt: file.createdAt
      })),
      subfolders: shareLink.folder.children.map(folder => ({
        id: folder.id,
        name: folder.name,
        description: folder.description,
        createdAt: folder.createdAt
      }))
    }
  });
}));

/**
 * @swagger
 * /api/shares/{token}/zip:
 *   get:
 *     summary: Download shared folder as ZIP
 *     tags: [Shares]
 */
router.get('/:token/zip', optionalAuth, asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.query;

  const shareLink = await ShareLink.findOne({
    where: { token },
    include: [{ model: Folder, as: 'folder' }]
  });

  if (!shareLink || !shareLink.folder) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found or invalid'
    });
  }

  // Check permissions (write or admin required for ZIP download)
  if (!['write', 'admin'].includes(shareLink.permissions)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions'
    });
  }

  // Check password and other validations same as above
  if (shareLink.password) {
    if (!password) {
      return res.status(401).json({
        success: false,
        message: 'Password required'
      });
    }

    const bcrypt = require('bcryptjs');
    const isValidPassword = await bcrypt.compare(password, shareLink.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }
  }

  // Get all files in folder recursively
  const getAllFiles = async (folderId) => {
    const files = await File.findAll({
      where: { folderId, isDeleted: false }
    });

    const subfolders = await Folder.findAll({
      where: { parentId: folderId, isDeleted: false }
    });

    for (const subfolder of subfolders) {
      const subFiles = await getAllFiles(subfolder.id);
      files.push(...subFiles);
    }

    return files;
  };

  const allFiles = await getAllFiles(shareLink.folder.id);

  if (allFiles.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No files found in folder'
    });
  }

  // Create ZIP
  const zipName = `${shareLink.folder.name}_shared`;
  const zipPath = await fileService.createZip(allFiles, zipName);

  // Record download
  await shareLink.recordDownload();

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}.zip"`);

  const fs = require('fs');
  const fileStream = fs.createReadStream(zipPath);
  fileStream.pipe(res);

  // Clean up ZIP file after download
  fileStream.on('end', () => {
    fs.unlink(zipPath, (err) => {
      if (err) console.error('Error deleting temp ZIP file:', err);
    });
  });
}));

/**
 * @swagger
 * /api/shares/user:
 *   get:
 *     summary: Get user's share links
 *     tags: [Shares]
 *     security:
 *       - bearerAuth: []
 */
router.get('/user/links', optionalAuth, asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const shareLinks = await ShareLink.findAll({
    where: { userId: req.user.id },
    include: [
      { model: File, as: 'file', attributes: ['id', 'originalName', 'size', 'mimeType'] },
      { model: Folder, as: 'folder', attributes: ['id', 'name'] }
    ],
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    shares: shareLinks.map(link => ({
      id: link.id,
      token: link.token,
      url: `${process.env.FRONTEND_URL}/share/${link.token}`,
      expiresAt: link.expiresAt,
      maxDownloads: link.maxDownloads,
      downloadCount: link.downloadCount,
      permissions: link.permissions,
      isActive: link.isActive,
      resource: link.file ? {
        type: 'file',
        id: link.file.id,
        name: link.file.originalName,
        size: link.file.size
      } : {
        type: 'folder',
        id: link.folder.id,
        name: link.folder.name
      },
      createdAt: link.createdAt
    }))
  });
}));

/**
 * @swagger
 * /api/shares/{id}:
 *   delete:
 *     summary: Delete share link
 *     tags: [Shares]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', optionalAuth, asyncHandler(async (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const { id } = req.params;

  const shareLink = await ShareLink.findOne({
    where: { id, userId: req.user.id }
  });

  if (!shareLink) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found'
    });
  }

  await shareLink.destroy();

  res.json({
    success: true,
    message: 'Share link deleted successfully'
  });
}));

module.exports = router;
