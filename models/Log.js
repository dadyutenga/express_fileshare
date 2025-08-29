const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Log = sequelize.define('Log', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  action: {
    type: DataTypes.ENUM(
      'user_login',
      'user_logout',
      'user_register',
      'file_upload',
      'file_download',
      'file_delete',
      'file_share',
      'folder_create',
      'folder_delete',
      'folder_share',
      'admin_user_ban',
      'admin_user_unban',
      'admin_file_delete',
      'payment_process',
      'subscription_create',
      'subscription_cancel',
      'report_create',
      'report_resolve',
      'settings_update',
      'password_change',
      'two_factor_enable',
      'two_factor_disable'
    ),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  location: {
    type: DataTypes.JSON,
    allowNull: true // { country, city, region }
  },
  oldValues: {
    type: DataTypes.JSON,
    allowNull: true
  },
  newValues: {
    type: DataTypes.JSON,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'low'
  },
  category: {
    type: DataTypes.ENUM(
      'authentication',
      'file_management',
      'user_management',
      'payment',
      'admin',
      'security',
      'system'
    ),
    allowNull: false
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['action'] },
    { fields: ['category'] },
    { fields: ['severity'] },
    { fields: ['createdAt'] },
    { fields: ['ipAddress'] }
  ]
});

// Instance methods
Log.prototype.getFormattedDescription = function() {
  // This could be enhanced with i18n
  return this.description;
};

Log.prototype.getTimeAgo = function() {
  const now = new Date();
  const diffTime = now - this.createdAt;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffTime / (1000 * 60));

  if (diffDays > 0) return `${diffDays} days ago`;
  if (diffHours > 0) return `${diffHours} hours ago`;
  if (diffMinutes > 0) return `${diffMinutes} minutes ago`;
  return 'Just now';
};

Log.prototype.isSuspicious = function() {
  // Simple heuristic for suspicious activity
  return this.severity === 'high' || this.severity === 'critical';
};

Log.prototype.getChanges = function() {
  if (!this.oldValues || !this.newValues) return null;

  const changes = {};
  for (const key in this.newValues) {
    if (this.oldValues[key] !== this.newValues[key]) {
      changes[key] = {
        from: this.oldValues[key],
        to: this.newValues[key]
      };
    }
  }
  return changes;
};

module.exports = Log;
