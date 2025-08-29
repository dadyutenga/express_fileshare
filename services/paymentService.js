const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { User, Payment, Subscription, Log } = require('../models');

class PaymentService {
  constructor() {
    this.stripe = stripe;
  }

  // Create payment intent
  async createPaymentIntent(amount, currency = 'usd', metadata = {}) {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata
    });

    return paymentIntent;
  }

  // Process payment
  async processPayment(userId, amount, currency = 'usd', description = '', metadata = {}) {
    const paymentIntent = await this.createPaymentIntent(amount, currency, {
      userId: userId.toString(),
      ...metadata
    });

    // Create payment record
    const payment = await Payment.create({
      userId,
      stripePaymentId: paymentIntent.id,
      amount,
      currency,
      status: 'pending',
      description,
      metadata
    });

    return {
      payment,
      clientSecret: paymentIntent.client_secret
    };
  }

  // Confirm payment
  async confirmPayment(paymentIntentId) {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    const payment = await Payment.findOne({
      where: { stripePaymentId: paymentIntentId }
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    payment.status = paymentIntent.status === 'succeeded' ? 'succeeded' : 'failed';
    await payment.save();

    // Log payment
    await Log.create({
      userId: payment.userId,
      action: 'payment_process',
      description: `Payment ${payment.status}: $${payment.amount}`,
      category: 'payment',
      resourceId: payment.id,
      metadata: { stripeId: paymentIntentId, status: payment.status }
    });

    return payment;
  }

  // Create subscription
  async createSubscription(userId, priceId, metadata = {}) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user already has an active subscription
    const existingSubscription = await Subscription.findOne({
      where: { userId, status: 'active' }
    });

    if (existingSubscription) {
      throw new Error('User already has an active subscription');
    }

    const subscription = await this.stripe.subscriptions.create({
      customer_email: user.email,
      items: [{ price: priceId }],
      metadata: {
        userId: userId.toString(),
        ...metadata
      }
    });

    // Create subscription record
    const dbSubscription = await Subscription.create({
      userId,
      stripeSubscriptionId: subscription.id,
      planName: this.getPlanNameFromPriceId(priceId),
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      storageLimit: this.getStorageLimitFromPriceId(priceId),
      metadata
    });

    // Update user role
    user.role = dbSubscription.planName === 'premium' ? 'premium_user' : user.role;
    await user.save();

    // Log subscription creation
    await Log.create({
      userId,
      action: 'subscription_create',
      description: `Created ${dbSubscription.planName} subscription`,
      category: 'payment',
      resourceId: dbSubscription.id
    });

    return dbSubscription;
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId, userId) {
    const subscription = await Subscription.findOne({
      where: { id: subscriptionId, userId }
    });

    if (!subscription) {
      throw new Error('Subscription not found');
    }

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    subscription.cancelAtPeriodEnd = true;
    subscription.canceledAt = new Date();
    await subscription.save();

    // Log cancellation
    await Log.create({
      userId,
      action: 'subscription_cancel',
      description: `Cancelled ${subscription.planName} subscription`,
      category: 'payment',
      resourceId: subscription.id
    });

    return subscription;
  }

  // Handle webhook
  async handleWebhook(event) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  // Webhook handlers
  async handlePaymentSucceeded(paymentIntent) {
    const payment = await Payment.findOne({
      where: { stripePaymentId: paymentIntent.id }
    });

    if (payment) {
      payment.status = 'succeeded';
      payment.receiptUrl = paymentIntent.charges.data[0]?.receipt_url;
      await payment.save();
    }
  }

  async handlePaymentFailed(paymentIntent) {
    const payment = await Payment.findOne({
      where: { stripePaymentId: paymentIntent.id }
    });

    if (payment) {
      payment.status = 'failed';
      await payment.save();
    }
  }

  async handleSubscriptionCreated(stripeSubscription) {
    // Already handled in createSubscription
  }

  async handleSubscriptionUpdated(stripeSubscription) {
    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id }
    });

    if (subscription) {
      subscription.status = stripeSubscription.status;
      subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
      subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
      await subscription.save();
    }
  }

  async handleSubscriptionDeleted(stripeSubscription) {
    const subscription = await Subscription.findOne({
      where: { stripeSubscriptionId: stripeSubscription.id }
    });

    if (subscription) {
      subscription.status = 'canceled';
      await subscription.save();

      // Downgrade user role
      const user = await User.findByPk(subscription.userId);
      if (user && user.role === 'premium_user') {
        user.role = 'user';
        await user.save();
      }
    }
  }

  async handleInvoicePaymentSucceeded(invoice) {
    // Handle successful subscription payment
  }

  async handleInvoicePaymentFailed(invoice) {
    // Handle failed subscription payment
  }

  // Utility methods
  getPlanNameFromPriceId(priceId) {
    const pricePlans = {
      'price_premium_monthly': 'premium',
      'price_enterprise_monthly': 'enterprise'
    };
    return pricePlans[priceId] || 'free';
  }

  getStorageLimitFromPriceId(priceId) {
    const storageLimits = {
      'price_premium_monthly': 107374182400, // 100GB
      'price_enterprise_monthly': 1099511627776 // 1TB
    };
    return storageLimits[priceId] || 1073741824; // 1GB default
  }

  // Get payment history
  async getPaymentHistory(userId, limit = 10, offset = 0) {
    return await Payment.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });
  }

  // Refund payment
  async refundPayment(paymentId, amount = null, reason = 'requested_by_customer') {
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'succeeded') {
      throw new Error('Can only refund successful payments');
    }

    const refundAmount = amount ? Math.round(amount * 100) : undefined;

    const refund = await this.stripe.refunds.create({
      payment_intent: payment.stripePaymentId,
      amount: refundAmount,
      reason
    });

    payment.refundedAmount = (payment.refundedAmount || 0) + (refund.amount / 100);
    payment.status = payment.refundedAmount >= payment.amount ? 'refunded' : 'succeeded';
    await payment.save();

    return refund;
  }

  // Create customer portal session
  async createCustomerPortalSession(userId) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // In a real implementation, you'd store the Stripe customer ID
    // For now, we'll create a session with the user's email
    const session = await this.stripe.billingPortal.sessions.create({
      customer_email: user.email,
      return_url: `${process.env.FRONTEND_URL}/billing`
    });

    return session;
  }
}

module.exports = new PaymentService();
