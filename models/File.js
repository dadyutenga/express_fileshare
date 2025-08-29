const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const File = sequelize.define('File', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  originalName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  mimeType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  size: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  path: {
    type: DataTypes.STRING,
    allowNull: false
  },
  s3Key: {
    type: DataTypes.STRING,
    allowNull: true
  },
  thumbnailPath: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isEncrypted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  encryptionKey: {
    type: DataTypes.STRING,
    allowNull: true
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  parentVersionId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Files',
      key: 'id'
    }
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isPublic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  downloadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastAccessed: {
    type: DataTypes.DATE,
    allowNull: true
  },
  checksum: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true,
  paranoid: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['folderId'] },
    { fields: ['isPublic'] },
    { fields: ['isDeleted'] },
    { fields: ['mimeType'] },
    { fields: ['tags'] },
    { fields: ['createdAt'] }
  ]
});

// Associations will be defined in index.js
module.exports = File;
