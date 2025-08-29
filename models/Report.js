const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  type: {
    type: DataTypes.ENUM(
      'inappropriate_content',
      'copyright_violation',
      'spam',
      'harassment',
      'illegal_content',
      'other'
    ),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'under_review', 'resolved', 'dismissed'),
    defaultValue: 'pending'
  },
  adminNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  resolvedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resolvedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  actionTaken: {
    type: DataTypes.ENUM(
      'none',
      'warning_sent',
      'content_removed',
      'user_suspended',
      'user_banned',
      'file_deleted',
      'folder_deleted'
    ),
    defaultValue: 'none'
  },
  severity: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium'
  },
  evidence: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['reporterId'] },
    { fields: ['status'] },
    { fields: ['type'] },
    { fields: ['severity'] },
    { fields: ['createdAt'] },
    { fields: ['fileId'] },
    { fields: ['folderId'] }
  ]
});

// Instance methods
Report.prototype.resolve = async function(adminId, action, notes) {
  this.status = 'resolved';
  this.resolvedAt = new Date();
  this.resolvedBy = adminId;
  this.actionTaken = action;
  this.adminNotes = notes;
  await this.save();
};

Report.prototype.dismiss = async function(adminId, notes) {
  this.status = 'dismissed';
  this.resolvedAt = new Date();
  this.resolvedBy = adminId;
  this.adminNotes = notes;
  await this.save();
};

Report.prototype.getAge = function() {
  const now = new Date();
  const diffTime = now - this.createdAt;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

Report.prototype.isOverdue = function() {
  const age = this.getAge();
  const overdueThresholds = {
    low: 7,
    medium: 3,
    high: 1,
    critical: 0
  };
  return age > overdueThresholds[this.severity];
};

module.exports = Report;
