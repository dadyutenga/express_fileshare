const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Folder = sequelize.define('Folder', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  path: {
    type: DataTypes.STRING,
    allowNull: false // Full path like /root/folder1/subfolder
  },
  parentId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Folders',
      key: 'id'
    }
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
  color: {
    type: DataTypes.STRING,
    allowNull: true
  },
  icon: {
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
    { fields: ['parentId'] },
    { fields: ['path'] },
    { fields: ['isPublic'] },
    { fields: ['isDeleted'] }
  ]
});

// Virtual for depth
Folder.prototype.getDepth = function() {
  return this.path.split('/').length - 2; // -2 for empty string at start and end
};

// Virtual for children count
Folder.prototype.getChildrenCount = async function() {
  const { File, Folder: FolderModel } = require('./index');
  const fileCount = await File.count({ where: { folderId: this.id } });
  const folderCount = await FolderModel.count({ where: { parentId: this.id } });
  return fileCount + folderCount;
};

module.exports = Folder;
