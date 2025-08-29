const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Subscription = sequelize.define('Subscription', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  stripeSubscriptionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  planName: {
    type: DataTypes.ENUM('free', 'premium', 'enterprise'),
    defaultValue: 'free'
  },
  status: {
    type: DataTypes.ENUM('active', 'canceled', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'trialing'),
    defaultValue: 'active'
  },
  currentPeriodStart: {
    type: DataTypes.DATE,
    allowNull: false
  },
  currentPeriodEnd: {
    type: DataTypes.DATE,
    allowNull: false
  },
  cancelAtPeriodEnd: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  canceledAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  trialStart: {
    type: DataTypes.DATE,
    allowNull: true
  },
  trialEnd: {
    type: DataTypes.DATE,
    allowNull: true
  },
  storageLimit: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  bandwidthLimit: {
    type: DataTypes.BIGINT,
    allowNull: true // in bytes per month
  },
  features: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  priceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['stripeSubscriptionId'] },
    { fields: ['status'] },
    { fields: ['planName'] },
    { fields: ['currentPeriodEnd'] }
  ]
});

// Instance methods
Subscription.prototype.isActive = function() {
  return this.status === 'active' || this.status === 'trialing';
};

Subscription.prototype.isExpired = function() {
  return new Date() > this.currentPeriodEnd;
};

Subscription.prototype.daysUntilExpiry = function() {
  const now = new Date();
  const diffTime = this.currentPeriodEnd - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

Subscription.prototype.getStorageUsage = async function() {
  const { File } = require('./index');
  const totalSize = await File.sum('size', {
    where: { userId: this.userId, isDeleted: false }
  });
  return {
    used: totalSize || 0,
    limit: this.storageLimit,
    percentage: Math.round(((totalSize || 0) / this.storageLimit) * 100)
  };
};

Subscription.prototype.hasFeature = function(feature) {
  return this.features[feature] === true;
};

module.exports = Subscription;
