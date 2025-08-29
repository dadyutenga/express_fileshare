const express = require('express');
const { body, validationResult } = require('express-validator');
const { User, Payment, Subscription, Log } = require('../models');
const { authenticateJWT, requirePremium } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const paymentService = require('../services/paymentService');

const router = express.Router();

/**
 * @swagger
 * /api/payments/create-intent:
 *   post:
 *     summary: Create payment intent
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/create-intent', authenticateJWT, [
  body('amount').isFloat({ min: 0.01 }),
  body('currency').optional().isIn(['usd', 'eur', 'gbp']),
  body('description').optional().isString()
], asyncHandler(async (req, res) => {
  const { amount, currency = 'usd', description } = req.body;

  const { payment, clientSecret } = await paymentService.processPayment(
    req.user.id,
    amount,
    currency,
    description
  );

  res.json({
    success: true,
    payment: {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status
    },
    clientSecret
  });
}));

/**
 * @swagger
 * /api/payments/subscribe:
 *   post:
 *     summary: Create subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/subscribe', authenticateJWT, [
  body('priceId').exists(),
  body('planName').optional().isIn(['premium', 'enterprise'])
], asyncHandler(async (req, res) => {
  const { priceId, planName } = req.body;

  const subscription = await paymentService.createSubscription(
    req.user.id,
    priceId
  );

  res.json({
    success: true,
    message: 'Subscription created successfully',
    subscription: {
      id: subscription.id,
      planName: subscription.planName,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      storageLimit: subscription.storageLimit
    }
  });
}));

/**
 * @swagger
 * /api/payments/subscription/cancel:
 *   post:
 *     summary: Cancel subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/subscription/cancel', authenticateJWT, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    include: [{ model: Subscription, as: 'subscription' }]
  });

  if (!user.subscription) {
    return res.status(404).json({
      success: false,
      message: 'No active subscription found'
    });
  }

  await paymentService.cancelSubscription(user.subscription.id, req.user.id);

  res.json({
    success: true,
    message: 'Subscription cancelled successfully'
  });
}));

/**
 * @swagger
 * /api/payments/history:
 *   get:
 *     summary: Get payment history
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/history', authenticateJWT, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const payments = await paymentService.getPaymentHistory(
    req.user.id,
    parseInt(limit),
    (parseInt(page) - 1) * parseInt(limit)
  );

  res.json({
    success: true,
    payments: payments.map(payment => ({
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      receiptUrl: payment.receiptUrl,
      createdAt: payment.createdAt
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
}));

/**
 * @swagger
 * /api/payments/refund/{paymentId}:
 *   post:
 *     summary: Refund payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/refund/:paymentId', authenticateJWT, [
  body('amount').optional().isFloat({ min: 0.01 }),
  body('reason').optional().isString()
], asyncHandler(async (req, res) => {
  const { paymentId } = req.params;
  const { amount, reason } = req.body;

  const refund = await paymentService.refundPayment(
    paymentId,
    amount,
    reason
  );

  res.json({
    success: true,
    message: 'Refund processed successfully',
    refund: {
      id: refund.id,
      amount: refund.amount / 100,
      currency: refund.currency,
      status: refund.status
    }
  });
}));

/**
 * @swagger
 * /api/payments/webhook:
 *   post:
 *     summary: Stripe webhook handler
 *     tags: [Payments]
 */
router.post('/webhook', express.raw({ type: 'application/json' }), asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = require('stripe')(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  await paymentService.handleWebhook(event);

  res.json({ received: true });
}));

/**
 * @swagger
 * /api/payments/customer-portal:
 *   post:
 *     summary: Create customer portal session
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.post('/customer-portal', authenticateJWT, asyncHandler(async (req, res) => {
  const session = await paymentService.createCustomerPortalSession(req.user.id);

  res.json({
    success: true,
    url: session.url
  });
}));

/**
 * @swagger
 * /api/payments/subscription:
 *   get:
 *     summary: Get current subscription
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 */
router.get('/subscription', authenticateJWT, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    include: [{ model: Subscription, as: 'subscription' }]
  });

  if (!user.subscription) {
    return res.json({
      success: true,
      subscription: null
    });
  }

  const storageUsage = await user.subscription.getStorageUsage();

  res.json({
    success: true,
    subscription: {
      id: user.subscription.id,
      planName: user.subscription.planName,
      status: user.subscription.status,
      currentPeriodStart: user.subscription.currentPeriodStart,
      currentPeriodEnd: user.subscription.currentPeriodEnd,
      storageLimit: user.subscription.storageLimit,
      storageUsage,
      cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
      features: user.subscription.features
    }
  });
}));

/**
 * @swagger
 * /api/payments/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Payments]
 */
router.get('/plans', asyncHandler(async (req, res) => {
  // In a real implementation, you'd fetch this from Stripe
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'usd',
      interval: 'month',
      storageLimit: 1073741824, // 1GB
      features: ['Basic file sharing', 'Limited storage']
    },
    {
      id: 'premium_monthly',
      name: 'Premium',
      price: 9.99,
      currency: 'usd',
      interval: 'month',
      storageLimit: 107374182400, // 100GB
      features: ['Unlimited sharing', 'Priority support', 'Advanced features']
    },
    {
      id: 'enterprise_monthly',
      name: 'Enterprise',
      price: 29.99,
      currency: 'usd',
      interval: 'month',
      storageLimit: 1099511627776, // 1TB
      features: ['All premium features', 'Custom integrations', 'Dedicated support']
    }
  ];

  res.json({
    success: true,
    plans
  });
}));

module.exports = router;
