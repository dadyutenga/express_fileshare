const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Payment = sequelize.define('Payment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  stripePaymentId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'usd'
  },
  status: {
    type: DataTypes.ENUM('pending', 'succeeded', 'failed', 'canceled', 'refunded'),
    defaultValue: 'pending'
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  paymentMethod: {
    type: DataTypes.STRING,
    allowNull: true
  },
  receiptUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  refundedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  refundReason: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  invoiceId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  taxAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  discountAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  }
}, {
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['stripePaymentId'] },
    { fields: ['status'] },
    { fields: ['createdAt'] }
  ]
});

// Instance methods
Payment.prototype.getNetAmount = function() {
  return parseFloat(this.amount) - parseFloat(this.refundedAmount);
};

Payment.prototype.isRefundable = function() {
  return this.status === 'succeeded' && parseFloat(this.refundedAmount) < parseFloat(this.amount);
};

Payment.prototype.canRefund = function(amount) {
  const remainingAmount = parseFloat(this.amount) - parseFloat(this.refundedAmount);
  return remainingAmount >= parseFloat(amount);
};

module.exports = Payment;
