const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  type: {
    type: DataTypes.ENUM(
      'file_shared',
      'file_downloaded',
      'comment_added',
      'user_followed',
      'subscription_expiring',
      'payment_failed',
      'system_announcement',
      'file_deleted',
      'folder_shared'
    ),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  actionUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  actionText: {
    type: DataTypes.STRING,
    allowNull: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  emailSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emailSentAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['type'] },
    { fields: ['isRead'] },
    { fields: ['priority'] },
    { fields: ['createdAt'] },
    { fields: ['expiresAt'] }
  ]
});

// Instance methods
Notification.prototype.markAsRead = async function() {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

Notification.prototype.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

Notification.prototype.getTimeAgo = function() {
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

Notification.prototype.shouldSendEmail = function() {
  return this.priority === 'high' || this.priority === 'urgent';
};

module.exports = Notification;
