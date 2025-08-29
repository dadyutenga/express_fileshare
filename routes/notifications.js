const express = require('express');
const { Notification, Log } = require('../models');
const { authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', authenticateJWT, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = { userId: req.user.id };
  if (unreadOnly === 'true') {
    whereClause.isRead = false;
  }

  const { count, rows: notifications } = await Notification.findAndCountAll({
    where: whereClause,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    notifications: notifications.map(notification => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      readAt: notification.readAt,
      priority: notification.priority,
      actionUrl: notification.actionUrl,
      actionText: notification.actionText,
      createdAt: notification.createdAt,
      timeAgo: notification.getTimeAgo()
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
 * /api/notifications/{id}/read:
 *   put:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id/read', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findOne({
    where: { id, userId: req.user.id }
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  if (!notification.isRead) {
    await notification.markAsRead();
  }

  res.json({
    success: true,
    message: 'Notification marked as read'
  });
}));

/**
 * @swagger
 * /api/notifications/read-all:
 *   put:
 *     summary: Mark all notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.put('/read-all', authenticateJWT, asyncHandler(async (req, res) => {
  await Notification.update(
    { isRead: true, readAt: new Date() },
    { where: { userId: req.user.id, isRead: false } }
  );

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
}));

/**
 * @swagger
 * /api/notifications/{id}:
 *   delete:
 *     summary: Delete notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', authenticateJWT, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await Notification.findOne({
    where: { id, userId: req.user.id }
  });

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  await notification.destroy();

  res.json({
    success: true,
    message: 'Notification deleted successfully'
  });
}));

/**
 * @swagger
 * /api/notifications/count:
 *   get:
 *     summary: Get unread notifications count
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.get('/count', authenticateJWT, asyncHandler(async (req, res) => {
  const unreadCount = await Notification.count({
    where: { userId: req.user.id, isRead: false }
  });

  res.json({
    success: true,
    count: unreadCount
  });
}));

/**
 * @swagger
 * /api/notifications/create:
 *   post:
 *     summary: Create notification (for system use)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 */
router.post('/create', authenticateJWT, asyncHandler(async (req, res) => {
  const { type, title, message, priority = 'medium', actionUrl, actionText, expiresAt } = req.body;

  const notification = await Notification.create({
    userId: req.user.id,
    type,
    title,
    message,
    priority,
    actionUrl,
    actionText,
    expiresAt
  });

  // Log notification creation
  await Log.create({
    userId: req.user.id,
    action: 'system_announcement',
    description: `Created notification: ${title}`,
    category: 'system'
  });

  res.status(201).json({
    success: true,
    message: 'Notification created successfully',
    notification: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      createdAt: notification.createdAt
    }
  });
}));

module.exports = router;
