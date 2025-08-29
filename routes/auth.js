const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { User, Log } = require('../models');
const { authenticate, authenticateJWT } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const emailService = require('../services/emailService');

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 })
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }

  const { email, password, name } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'User already exists with this email'
    });
  }

  // Create user
  const user = await User.create({
    email,
    password,
    name,
    verificationToken: emailService.generateToken()
  });

  // Send verification email
  await emailService.sendVerificationEmail(user, user.verificationToken);

  // Log registration
  await Log.create({
    userId: user.id,
    action: 'user_register',
    description: `User registered: ${email}`,
    category: 'authentication'
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully. Please check your email for verification.',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isVerified: user.isVerified
    }
  });
}));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               twoFactorToken:
 *                 type: string
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists(),
  body('twoFactorToken').optional().isLength({ min: 6, max: 6 })
], asyncHandler(async (req, res) => {
  const { email, password, twoFactorToken } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  const isValidPassword = await user.comparePassword(password);
  if (!isValidPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password'
    });
  }

  if (!user.isVerified) {
    return res.status(401).json({
      success: false,
      message: 'Please verify your email first'
    });
  }

  if (user.twoFactorEnabled) {
    if (!twoFactorToken) {
      return res.status(401).json({
        success: false,
        message: 'Two-factor authentication required',
        requires2FA: true
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: twoFactorToken
    });

    if (!verified) {
      return res.status(401).json({
        success: false,
        message: 'Invalid two-factor token'
      });
    }
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate JWT
  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  // Log login
  await Log.create({
    userId: user.id,
    action: 'user_login',
    description: `User logged in: ${email}`,
    category: 'authentication'
  });

  res.json({
    success: true,
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      storageUsage: user.getStorageUsage()
    }
  });
}));

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify user email
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 */
router.post('/verify-email', [
  body('token').exists()
], asyncHandler(async (req, res) => {
  const { token } = req.body;

  const user = await emailService.verifyEmailToken(token);

  res.json({
    success: true,
    message: 'Email verified successfully',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isVerified: user.isVerified
    }
  });
}));

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 */
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail()
], asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  const resetToken = emailService.generateToken();
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  await user.save();

  await emailService.sendPasswordResetEmail(user, resetToken);

  res.json({
    success: true,
    message: 'Password reset email sent'
  });
}));

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 6
 */
router.post('/reset-password', [
  body('token').exists(),
  body('password').isLength({ min: 6 })
], asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await emailService.verifyPasswordResetToken(token);

  user.password = password;
  user.resetPasswordToken = null;
  user.resetPasswordExpires = null;
  await user.save();

  // Log password change
  await Log.create({
    userId: user.id,
    action: 'password_change',
    description: 'Password reset successfully',
    category: 'security'
  });

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
}));

/**
 * @swagger
 * /api/auth/setup-2fa:
 *   post:
 *     summary: Setup two-factor authentication
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 */
router.post('/setup-2fa', authenticateJWT, asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.twoFactorEnabled) {
    return res.status(400).json({
      success: false,
      message: 'Two-factor authentication already enabled'
    });
  }

  const secret = speakeasy.generateSecret({
    name: `ShareVault (${user.email})`,
    issuer: 'ShareVault'
  });

  user.twoFactorSecret = secret.base32;
  await user.save();

  const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

  res.json({
    success: true,
    message: 'Two-factor authentication setup initiated',
    secret: secret.base32,
    qrCode: qrCodeUrl
  });
}));

/**
 * @swagger
 * /api/auth/verify-2fa:
 *   post:
 *     summary: Verify and enable two-factor authentication
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 */
router.post('/verify-2fa', authenticateJWT, [
  body('token').isLength({ min: 6, max: 6 })
], asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = req.user;

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token
  });

  if (!verified) {
    return res.status(400).json({
      success: false,
      message: 'Invalid token'
    });
  }

  user.twoFactorEnabled = true;
  await user.save();

  // Log 2FA enable
  await Log.create({
    userId: user.id,
    action: 'two_factor_enable',
    description: 'Two-factor authentication enabled',
    category: 'security'
  });

  res.json({
    success: true,
    message: 'Two-factor authentication enabled successfully'
  });
}));

/**
 * @swagger
 * /api/auth/disable-2fa:
 *   post:
 *     summary: Disable two-factor authentication
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 */
router.post('/disable-2fa', authenticateJWT, [
  body('token').isLength({ min: 6, max: 6 })
], asyncHandler(async (req, res) => {
  const { token } = req.body;
  const user = req.user;

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token
  });

  if (!verified) {
    return res.status(400).json({
      success: false,
      message: 'Invalid token'
    });
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = null;
  await user.save();

  // Log 2FA disable
  await Log.create({
    userId: user.id,
    action: 'two_factor_disable',
    description: 'Two-factor authentication disabled',
    category: 'security'
  });

  res.json({
    success: true,
    message: 'Two-factor authentication disabled successfully'
  });
}));

// OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  asyncHandler(async (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  })
);

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/login' }),
  asyncHandler(async (req, res) => {
    const token = jwt.sign(
      { id: req.user.id, email: req.user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  })
);

module.exports = router;
