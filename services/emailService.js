const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { User } = require('../models');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  // Send verification email
  async sendVerificationEmail(user, token) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Verify Your ShareVault Account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to ShareVault!</h2>
          <p>Please verify your email address to complete your registration.</p>
          <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
          <p>If the button doesn't work, copy and paste this link: ${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
        </div>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Send password reset email
  async sendPasswordResetEmail(user, token) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Password Reset Request - ShareVault',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your ShareVault account.</p>
          <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>If the button doesn't work, copy and paste this link: ${resetUrl}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Send file share notification
  async sendFileShareNotification(recipientEmail, sharerName, fileName, shareUrl) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: recipientEmail,
      subject: `${sharerName} shared a file with you - ShareVault`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>File Shared</h2>
          <p>${sharerName} has shared "${fileName}" with you.</p>
          <a href="${shareUrl}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View File</a>
          <p>If the button doesn't work, copy and paste this link: ${shareUrl}</p>
        </div>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Send subscription confirmation
  async sendSubscriptionConfirmation(user, planName, amount) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Subscription Activated - ShareVault',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Subscription Activated!</h2>
          <p>Thank you for subscribing to ShareVault ${planName} plan.</p>
          <p><strong>Amount Paid:</strong> $${amount}</p>
          <p>Your subscription is now active and you can enjoy all premium features.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
        </div>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Send payment failure notification
  async sendPaymentFailureNotification(user, amount, error) {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: 'Payment Failed - ShareVault',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Payment Failed</h2>
          <p>We were unable to process your payment of $${amount}.</p>
          <p><strong>Error:</strong> ${error}</p>
          <p>Please update your payment method and try again.</p>
          <a href="${process.env.FRONTEND_URL}/billing" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Update Payment Method</a>
        </div>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Send admin notification
  async sendAdminNotification(subject, message, details = {}) {
    const adminEmail = process.env.ADMIN_EMAIL;

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: adminEmail,
      subject: `ShareVault Admin: ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>${subject}</h2>
          <p>${message}</p>
          ${Object.keys(details).length > 0 ? `
            <h3>Details:</h3>
            <ul>
              ${Object.entries(details).map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`).join('')}
            </ul>
          ` : ''}
        </div>
      `
    };

    await this.transporter.sendMail(mailOptions);
  }

  // Generate secure token
  generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Verify email token
  async verifyEmailToken(token) {
    const user = await User.findOne({
      where: {
        verificationToken: token,
        isVerified: false
      }
    });

    if (!user) {
      throw new Error('Invalid or expired verification token');
    }

    // Check if token is expired (24 hours)
    const tokenAge = Date.now() - user.updatedAt;
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (tokenAge > maxAge) {
      throw new Error('Verification token has expired');
    }

    user.isVerified = true;
    user.verificationToken = null;
    await user.save();

    return user;
  }

  // Verify password reset token
  async verifyPasswordResetToken(token) {
    const user = await User.findOne({
      where: {
        resetPasswordToken: token
      }
    });

    if (!user || !user.resetPasswordExpires) {
      throw new Error('Invalid or expired reset token');
    }

    if (Date.now() > user.resetPasswordExpires) {
      throw new Error('Reset token has expired');
    }

    return user;
  }
}

module.exports = new EmailService();
