const { sequelize } = require('../config/database');

// Import all models
const User = require('./User');
const File = require('./File');
const Folder = require('./Folder');
const ShareLink = require('./ShareLink');
const Payment = require('./Payment');
const Subscription = require('./Subscription');
const Notification = require('./Notification');
const Report = require('./Report');
const Log = require('./Log');

// Define associations

// User associations
User.hasMany(File, { foreignKey: 'userId', as: 'files' });
User.hasMany(Folder, { foreignKey: 'userId', as: 'folders' });
User.hasMany(ShareLink, { foreignKey: 'userId', as: 'shareLinks' });
User.hasMany(Payment, { foreignKey: 'userId', as: 'payments' });
User.hasOne(Subscription, { foreignKey: 'userId', as: 'subscription' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
User.hasMany(Report, { foreignKey: 'reporterId', as: 'reports' });
User.hasMany(Log, { foreignKey: 'userId', as: 'logs' });

// File associations
File.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
File.belongsTo(Folder, { foreignKey: 'folderId', as: 'folder' });
File.hasMany(ShareLink, { foreignKey: 'fileId', as: 'shareLinks' });
File.hasMany(Report, { foreignKey: 'fileId', as: 'reports' });
File.hasMany(Log, { foreignKey: 'resourceId', as: 'logs' });
File.belongsTo(File, { foreignKey: 'parentVersionId', as: 'parentVersion' });
File.hasMany(File, { foreignKey: 'parentVersionId', as: 'versions' });

// Folder associations
Folder.belongsTo(User, { foreignKey: 'userId', as: 'owner' });
Folder.belongsTo(Folder, { foreignKey: 'parentId', as: 'parent' });
Folder.hasMany(Folder, { foreignKey: 'parentId', as: 'children' });
Folder.hasMany(File, { foreignKey: 'folderId', as: 'files' });
Folder.hasMany(ShareLink, { foreignKey: 'folderId', as: 'shareLinks' });
Folder.hasMany(Report, { foreignKey: 'folderId', as: 'reports' });
Folder.hasMany(Log, { foreignKey: 'resourceId', as: 'logs' });

// ShareLink associations
ShareLink.belongsTo(User, { foreignKey: 'userId', as: 'creator' });
ShareLink.belongsTo(File, { foreignKey: 'fileId', as: 'file' });
ShareLink.belongsTo(Folder, { foreignKey: 'folderId', as: 'folder' });

// Payment associations
Payment.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Subscription associations
Subscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Notification associations
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Report associations
Report.belongsTo(User, { foreignKey: 'reporterId', as: 'reporter' });
Report.belongsTo(User, { foreignKey: 'resolvedBy', as: 'resolver' });
Report.belongsTo(File, { foreignKey: 'fileId', as: 'file' });
Report.belongsTo(Folder, { foreignKey: 'folderId', as: 'folder' });

// Log associations
Log.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Export all models
module.exports = {
  sequelize,
  User,
  File,
  Folder,
  ShareLink,
  Payment,
  Subscription,
  Notification,
  Report,
  Log
};
