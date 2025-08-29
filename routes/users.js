const express = require('express');
const { body, validationResult } = require('express-validator');
const { User, Log } = require('../models');
const { authenticateJWT } = require('../middleware/auth');
const { uploadAvatar, handleUploadError } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get('/profile', authenticateJWT, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'twoFactorSecret'] }
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role,
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      storageUsage: user.getStorageUsage(),
      preferences: user.preferences,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  });
}));

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.put('/profile', authenticateJWT, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('preferences').optional().isObject()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { name, bio, preferences } = req.body;
  const user = await User.findByPk(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const oldValues = {
    name: user.name,
    bio: user.bio,
    preferences: user.preferences
  };

  if (name) user.name = name;
  if (bio !== undefined) user.bio = bio;
  if (preferences) user.preferences = { ...user.preferences, ...preferences };

  await user.save();

  // Log update
  await Log.create({
    userId: user.id,
    action: 'settings_update',
    description: 'Updated user profile',
    category: 'user_management',
    oldValues,
    newValues: { name, bio, preferences }
  });

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      preferences: user.preferences
    }
  });
}));

/**
 * @swagger
 * /api/users/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.post('/avatar', authenticateJWT, (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err) {
      return handleUploadError(err, req, res, next);
    }
    next();
  });
}, asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No avatar file uploaded'
    });
  }

  const user = await User.findByPk(req.user.id);

  // Delete old avatar if exists
  if (user.avatar) {
    const fs = require('fs').promises;
    const path = require('path');
    const oldAvatarPath = path.join(__dirname, '../uploads/avatars', user.avatar);
    try {
      await fs.unlink(oldAvatarPath);
    } catch (error) {
      console.error('Error deleting old avatar:', error);
    }
  }

  user.avatar = req.file.filename;
  await user.save();

  // Log avatar update
  await Log.create({
    userId: user.id,
    action: 'settings_update',
    description: 'Updated user avatar',
    category: 'user_management'
  });

  res.json({
    success: true,
    message: 'Avatar updated successfully',
    avatar: user.avatar
  });
}));

/**
 * @swagger
 * /api/users/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.post('/change-password', authenticateJWT, [
  body('currentPassword').exists(),
  body('newPassword').isLength({ min: 6 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { currentPassword, newPassword } = req.body;
  const user = await User.findByPk(req.user.id);

  const isValidPassword = await user.comparePassword(currentPassword);
  if (!isValidPassword) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect'
    });
  }

  user.password = newPassword;
  await user.save();

  // Log password change
  await Log.create({
    userId: user.id,
    action: 'password_change',
    description: 'Changed password',
    category: 'security'
  });

  res.json({
    success: true,
    message: 'Password changed successfully'
  });
}));

/**
 * @swagger
 * /api/users/storage:
 *   get:
 *     summary: Get user storage usage
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.get('/storage', authenticateJWT, asyncHandler(async (req, res) => {
  const { File } = require('../models');

  const totalSize = await File.sum('size', {
    where: { userId: req.user.id, isDeleted: false }
  });

  const user = await User.findByPk(req.user.id);

  res.json({
    success: true,
    storage: {
      used: totalSize || 0,
      limit: user.storageLimit,
      percentage: Math.round(((totalSize || 0) / user.storageLimit) * 100),
      available: user.storageLimit - (totalSize || 0)
    }
  });
}));

/**
 * @swagger
 * /api/users/follow/{userId}:
 *   post:
 *     summary: Follow a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 */
router.post('/follow/:userId', authenticateJWT, asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot follow yourself'
    });
  }

  const targetUser = await User.findByPk(userId);
  if (!targetUser) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // In a real implementation, you'd have a Follow model
  // For now, we'll just log the action
  await Log.create({
    userId: req.user.id,
    action: 'user_followed',
    description: `Followed user: ${targetUser.name}`,
    category: 'user_management',
    resourceId: targetUser.id
  });

  res.json({
    success: true,
    message: `Now following ${targetUser.name}`
  });
}));

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get user public profile
 *     tags: [Users]
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const user = await User.findByPk(id, {
    attributes: ['id', 'name', 'avatar', 'bio', 'createdAt']
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Get user's public files count
  const { File } = require('../models');
  const publicFilesCount = await File.count({
    where: { userId: id, isPublic: true, isDeleted: false }
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio,
      publicFilesCount,
      joinedAt: user.createdAt
    }
  });
}));

/**
 * @swagger
 * /api/users/search:
 *   get:
 *     summary: Search users
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  const users = await User.findAll({
    where: {
      [require('sequelize').Op.or]: [
        { name: { [require('sequelize').Op.iLike]: `%${q}%` } },
        { email: { [require('sequelize').Op.iLike]: `%${q}%` } }
      ],
      isActive: true
    },
    attributes: ['id', 'name', 'avatar', 'bio'],
    limit: 20
  });

  res.json({
    success: true,
    users: users.map(user => ({
      id: user.id,
      name: user.name,
      avatar: user.avatar,
      bio: user.bio
    }))
  });
}));

module.exports = router;
