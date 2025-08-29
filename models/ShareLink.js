const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ShareLink = sequelize.define('ShareLink', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  token: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  maxDownloads: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  downloadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  permissions: {
    type: DataTypes.ENUM('read', 'write', 'admin'),
    defaultValue: 'read'
  },
  accessCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastAccessed: {
    type: DataTypes.DATE,
    allowNull: true
  },
  ipWhitelist: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['token'] },
    { fields: ['expiresAt'] },
    { fields: ['isActive'] },
    { fields: ['userId'] },
    { fields: ['fileId'] },
    { fields: ['folderId'] }
  ]
});

// Instance methods
ShareLink.prototype.isExpired = function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

ShareLink.prototype.canDownload = function() {
  if (!this.isActive) return false;
  if (this.isExpired()) return false;
  if (this.maxDownloads && this.downloadCount >= this.maxDownloads) return false;
  return true;
};

ShareLink.prototype.recordAccess = async function(ip) {
  this.accessCount += 1;
  this.lastAccessed = new Date();
  await this.save();
};

ShareLink.prototype.recordDownload = async function() {
  this.downloadCount += 1;
  await this.save();
};

module.exports = ShareLink;
