const express = require('express');
const { body, validationResult } = require('express-validator');
const { Folder, File, ShareLink, Log } = require('../models');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const fileService = require('../services/fileService');

const router = express.Router();

/**
 * @swagger
 * /api/folders:
 *   post:
 *     summary: Create a new folder
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               parentId:
 *                 type: string
 *               description:
 *                 type: string
 */
router.post('/', authenticateJWT, [
  body('name').trim().isLength({ min: 1, max: 255 }),
  body('parentId').optional().isUUID(),
  body('description').optional().trim()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, parentId, description } = req.body;

  // Check if parent folder exists and belongs to user
  if (parentId) {
    const parentFolder = await Folder.findOne({
      where: { id: parentId, userId: req.user.id }
    });
    if (!parentFolder) {
      return res.status(404).json({
        success: false,
        message: 'Parent folder not found'
      });
    }
  }

  const folder = await fileService.createFolder(name, req.user.id, parentId);

  if (description) {
    folder.description = description;
    await folder.save();
  }

  res.status(201).json({
    success: true,
    message: 'Folder created successfully',
    folder: {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      description: folder.description,
      parentId: folder.parentId,
      createdAt: folder.createdAt
    }
  });
}));

/**
 * @swagger
 * /api/folders:
 *   get:
 *     summary: Get user's folders
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: parentId
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
  const { parentId, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = {
    userId: req.user.id,
    isDeleted: false
  };

  if (parentId) {
    whereClause.parentId = parentId;
  } else {
    whereClause.parentId = null; // Root folders
  }

  const { count, rows: folders } = await Folder.findAndCountAll({
    where: whereClause,
    order: [['name', 'ASC']],
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  res.json({
    success: true,
    folders: folders.map(folder => ({
      id: folder.id,
      name: folder.name,
      path: folder.path,
      description: folder.description,
      parentId: folder.parentId,
      createdAt: folder.createdAt
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
 * /api/folders/{id}/contents:
 *   get:
 *     summary: Get folder contents (files and subfolders)
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/contents', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const contents = await fileService.getFolderContents(id, req.user.id);

  res.json({
    success: true,
    folder: {
      id: contents.folder.id,
      name: contents.folder.name,
      path: contents.folder.path,
      description: contents.folder.description
    },
    files: contents.files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      thumbnailPath: file.thumbnailPath,
      createdAt: file.createdAt
    })),
    subfolders: contents.subfolders.map(folder => ({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      createdAt: folder.createdAt
    }))
  });
}));

/**
 * @swagger
 * /api/folders/{id}:
 *   get:
 *     summary: Get folder details
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const folder = await Folder.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!folder) {
    return res.status(404).json({
      success: false,
      message: 'Folder not found'
    });
  }

  res.json({
    success: true,
    folder: {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      description: folder.description,
      parentId: folder.parentId,
      color: folder.color,
      icon: folder.icon,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt
    }
  });
}));

/**
 * @swagger
 * /api/folders/{id}:
 *   put:
 *     summary: Update folder
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', authenticateJWT, [
  body('name').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional().trim(),
  body('color').optional().isHexColor(),
  body('icon').optional().trim()
], asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, color, icon } = req.body;

  const folder = await Folder.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!folder) {
    return res.status(404).json({
      success: false,
      message: 'Folder not found'
    });
  }

  const oldValues = {
    name: folder.name,
    description: folder.description,
    color: folder.color,
    icon: folder.icon
  };

  if (name) folder.name = name;
  if (description !== undefined) folder.description = description;
  if (color) folder.color = color;
  if (icon) folder.icon = icon;

  await folder.save();

  // Log update
  await Log.create({
    userId: req.user.id,
    action: 'settings_update',
    description: `Updated folder: ${folder.name}`,
    category: 'file_management',
    resourceId: folder.id,
    oldValues,
    newValues: { name, description, color, icon }
  });

  res.json({
    success: true,
    message: 'Folder updated successfully',
    folder: {
      id: folder.id,
      name: folder.name,
      description: folder.description,
      color: folder.color,
      icon: folder.icon
    }
  });
}));

/**
 * @swagger
 * /api/folders/{id}:
 *   delete:
 *     summary: Delete folder
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const folder = await Folder.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!folder) {
    return res.status(404).json({
      success: false,
      message: 'Folder not found'
    });
  }

  // Soft delete
  folder.isDeleted = true;
  folder.deletedAt = new Date();
  await folder.save();

  // Log deletion
  await Log.create({
    userId: req.user.id,
    action: 'folder_delete',
    description: `Deleted folder: ${folder.name}`,
    category: 'file_management',
    resourceId: folder.id
  });

  res.json({
    success: true,
    message: 'Folder deleted successfully'
  });
}));

/**
 * @swagger
 * /api/folders/{id}/share:
 *   post:
 *     summary: Create share link for folder
 *     tags: [Folders]
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

  const folder = await Folder.findOne({
    where: { id, userId: req.user.id, isDeleted: false }
  });

  if (!folder) {
    return res.status(404).json({
      success: false,
      message: 'Folder not found'
    });
  }

  const shareLink = await ShareLink.create({
    userId: req.user.id,
    folderId: id,
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
    action: 'folder_share',
    description: `Shared folder: ${folder.name}`,
    category: 'file_management',
    resourceId: folder.id
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

/**
 * @swagger
 * /api/folders/tree:
 *   get:
 *     summary: Get folder tree structure
 *     tags: [Folders]
 *     security:
 *       - bearerAuth: []
 */
router.get('/tree/structure', authenticateJWT, asyncHandler(async (req, res) => {
  const folders = await Folder.findAll({
    where: {
      userId: req.user.id,
      isDeleted: false
    },
    order: [['path', 'ASC']]
  });

  // Build tree structure
  const folderMap = new Map();
  const rootFolders = [];

  folders.forEach(folder => {
    folderMap.set(folder.id, {
      id: folder.id,
      name: folder.name,
      path: folder.path,
      parentId: folder.parentId,
      children: []
    });
  });

  folders.forEach(folder => {
    const folderNode = folderMap.get(folder.id);

    if (folder.parentId) {
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children.push(folderNode);
      }
    } else {
      rootFolders.push(folderNode);
    }
  });

  res.json({
    success: true,
    tree: rootFolders
  });
}));

module.exports = router;
