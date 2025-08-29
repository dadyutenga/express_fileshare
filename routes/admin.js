const express = require('express');
const { User, File, Payment, Log, Report } = require('../models');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * @swagger
 * /api/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard data
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/dashboard', requireAdmin, asyncHandler(async (req, res) => {
  // Get various stats
  const [
    totalUsers,
    activeUsers,
    totalFiles,
    totalStorage,
    totalPayments,
    recentReports
  ] = await Promise.all([
    User.count(),
    User.count({ where: { isActive: true } }),
    File.count({ where: { isDeleted: false } }),
    File.sum('size', { where: { isDeleted: false } }),
    Payment.sum('amount'),
    Report.findAll({
      limit: 5,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'reporter', attributes: ['name', 'email'] },
        { model: File, as: 'file', attributes: ['originalName'] }
      ]
    })
  ]);

  // Get storage usage by user
  const storageByUser = await File.findAll({
    attributes: [
      'userId',
      [require('sequelize').fn('SUM', require('sequelize').col('size')), 'totalSize']
    ],
    where: { isDeleted: false },
    group: ['userId'],
    include: [{ model: User, as: 'owner', attributes: ['name', 'email'] }],
    order: [[require('sequelize').fn('SUM', require('sequelize').col('size')), 'DESC']],
    limit: 10
  });

  res.json({
    success: true,
    dashboard: {
      stats: {
        totalUsers,
        activeUsers,
        totalFiles,
        totalStorage: totalStorage || 0,
        totalRevenue: totalPayments || 0
      },
      storageByUser: storageByUser.map(item => ({
        user: item.owner,
        storage: parseInt(item.dataValues.totalSize) || 0
      })),
      recentReports: recentReports.map(report => ({
        id: report.id,
        type: report.type,
        description: report.description,
        status: report.status,
        severity: report.severity,
        reporter: report.reporter,
        file: report.file,
        createdAt: report.createdAt
      }))
    }
  });
}));

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: Get all users
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/users', requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, role, status } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = {};
  if (search) {
    whereClause[require('sequelize').Op.or] = [
      { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
      { email: { [require('sequelize').Op.iLike]: `%${search}%` } }
    ];
  }
  if (role) whereClause.role = role;
  if (status === 'active') whereClause.isActive = true;
  if (status === 'inactive') whereClause.isActive = false;

  const { count, rows: users } = await User.findAndCountAll({
    where: whereClause,
    attributes: { exclude: ['password', 'resetPasswordToken', 'resetPasswordExpires', 'twoFactorSecret'] },
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    users: users.map(user => ({
      ...user.toJSON(),
      storageUsage: user.getStorageUsage()
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
 * /api/admin/users/{id}:
 *   put:
 *     summary: Update user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.put('/users/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role, isActive, storageLimit } = req.body;

  const user = await User.findByPk(id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const oldValues = {
    role: user.role,
    isActive: user.isActive,
    storageLimit: user.storageLimit
  };

  if (role) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (storageLimit) user.storageLimit = storageLimit;

  await user.save();

  // Log admin action
  await Log.create({
    userId: req.user.id,
    action: 'admin_user_update',
    description: `Updated user ${user.email}: ${JSON.stringify(oldValues)} -> ${JSON.stringify({ role, isActive, storageLimit })}`,
    category: 'admin',
    resourceId: user.id,
    oldValues,
    newValues: { role, isActive, storageLimit }
  });

  res.json({
    success: true,
    message: 'User updated successfully',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      storageLimit: user.storageLimit
    }
  });
}));

/**
 * @swagger
 * /api/admin/users/{id}/ban:
 *   post:
 *     summary: Ban user
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/users/:id/ban', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const user = await User.findByPk(id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  user.isActive = false;
  await user.save();

  // Log ban
  await Log.create({
    userId: req.user.id,
    action: 'admin_user_ban',
    description: `Banned user ${user.email}. Reason: ${reason || 'No reason provided'}`,
    category: 'admin',
    resourceId: user.id
  });

  res.json({
    success: true,
    message: 'User banned successfully'
  });
}));

/**
 * @swagger
 * /api/admin/files:
 *   get:
 *     summary: Get all files
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/files', requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, userId } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = { isDeleted: false };
  if (search) {
    whereClause.originalName = { [require('sequelize').Op.iLike]: `%${search}%` };
  }
  if (userId) whereClause.userId = userId;

  const { count, rows: files } = await File.findAndCountAll({
    where: whereClause,
    include: [{ model: User, as: 'owner', attributes: ['name', 'email'] }],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    files: files.map(file => ({
      id: file.id,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      owner: file.owner,
      createdAt: file.createdAt
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
 * /api/admin/files/{id}/delete:
 *   delete:
 *     summary: Delete file (admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/files/:id/delete', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;

  const file = await File.findByPk(id, {
    include: [{ model: User, as: 'owner' }]
  });

  if (!file) {
    return res.status(404).json({
      success: false,
      message: 'File not found'
    });
  }

  await file.destroy();

  // Log admin file deletion
  await Log.create({
    userId: req.user.id,
    action: 'admin_file_delete',
    description: `Admin deleted file: ${file.originalName} (owned by ${file.owner.email})`,
    category: 'admin',
    resourceId: file.id
  });

  res.json({
    success: true,
    message: 'File deleted successfully'
  });
}));

/**
 * @swagger
 * /api/admin/reports:
 *   get:
 *     summary: Get all reports
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/reports', requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, type } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = {};
  if (status) whereClause.status = status;
  if (type) whereClause.type = type;

  const { count, rows: reports } = await Report.findAndCountAll({
    where: whereClause,
    include: [
      { model: User, as: 'reporter', attributes: ['name', 'email'] },
      { model: File, as: 'file', attributes: ['originalName'] },
      { model: Folder, as: 'folder', attributes: ['name'] }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    reports: reports.map(report => ({
      id: report.id,
      type: report.type,
      description: report.description,
      status: report.status,
      severity: report.severity,
      actionTaken: report.actionTaken,
      reporter: report.reporter,
      file: report.file,
      folder: report.folder,
      createdAt: report.createdAt,
      resolvedAt: report.resolvedAt
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
 * /api/admin/reports/{id}/resolve:
 *   post:
 *     summary: Resolve report
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.post('/reports/:id/resolve', requireAdmin, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action, notes } = req.body;

  const report = await Report.findByPk(id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Report not found'
    });
  }

  await report.resolve(req.user.id, action, notes);

  // Log report resolution
  await Log.create({
    userId: req.user.id,
    action: 'report_resolve',
    description: `Resolved report ${id} with action: ${action}`,
    category: 'admin',
    resourceId: report.id
  });

  res.json({
    success: true,
    message: 'Report resolved successfully'
  });
}));

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: Get system logs
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/logs', requireAdmin, asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, userId, action, category, severity } = req.query;
  const offset = (page - 1) * limit;

  const whereClause = {};
  if (userId) whereClause.userId = userId;
  if (action) whereClause.action = action;
  if (category) whereClause.category = category;
  if (severity) whereClause.severity = severity;

  const { count, rows: logs } = await Log.findAndCountAll({
    where: whereClause,
    include: [{ model: User, as: 'user', attributes: ['name', 'email'] }],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    logs: logs.map(log => ({
      id: log.id,
      action: log.action,
      description: log.description,
      category: log.category,
      severity: log.severity,
      ipAddress: log.ipAddress,
      user: log.user,
      createdAt: log.createdAt
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
 * /api/admin/stats:
 *   get:
 *     summary: Get detailed statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats', requireAdmin, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate && endDate) {
    dateFilter.createdAt = {
      [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  const [
    userRegistrations,
    fileUploads,
    payments,
    reports
  ] = await Promise.all([
    User.count({ where: dateFilter }),
    File.count({ where: { ...dateFilter, isDeleted: false } }),
    Payment.sum('amount', { where: dateFilter }),
    Report.count({ where: dateFilter })
  ]);

  res.json({
    success: true,
    stats: {
      period: { startDate, endDate },
      userRegistrations,
      fileUploads,
      totalRevenue: payments || 0,
      reports
    }
  });
}));

module.exports = router;
