const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true // null for OAuth users
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  avatar: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('user', 'premium_user', 'admin'),
    defaultValue: 'user'
  },
  isVerified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resetPasswordToken: {
    type: DataTypes.STRING,
    allowNull: true
  },
  resetPasswordExpires: {
    type: DataTypes.DATE,
    allowNull: true
  },
  twoFactorSecret: {
    type: DataTypes.STRING,
    allowNull: true
  },
  twoFactorEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  githubId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  storageUsed: {
    type: DataTypes.BIGINT,
    defaultValue: 0
  },
  storageLimit: {
    type: DataTypes.BIGINT,
    defaultValue: 1073741824 // 1GB in bytes
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastLogin: {
    type: DataTypes.DATE,
    allowNull: true
  },
  preferences: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true,
  paranoid: true,
  indexes: [
    { fields: ['email'] },
    { fields: ['isVerified'] }
  ]
});

// Hash password before saving
User.beforeCreate(async (user) => {
  if (user.password) {
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(user.password, salt);
  }
});

User.beforeUpdate(async (user) => {
  if (user.changed('password') && user.password) {
    const salt = await bcrypt.genSalt(12);
    user.password = await bcrypt.hash(user.password, salt);
  }
});

// Instance methods
User.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

User.prototype.getStorageUsage = function() {
  return {
    used: this.storageUsed,
    limit: this.storageLimit,
    percentage: Math.round((this.storageUsed / this.storageLimit) * 100)
  };
};

module.exports = User;
