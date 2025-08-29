const passport = require('passport');
const { User } = require('../models');

// JWT Authentication middleware
const authenticateJWT = passport.authenticate('jwt', { session: false });

// Local authentication middleware
const authenticateLocal = passport.authenticate('local', { session: false });

// Combined auth middleware that tries JWT first, then falls back to local
const authenticate = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (user) {
      req.user = user;
      return next();
    }

    // If no JWT user, try local auth if credentials provided
    if (req.body.email && req.body.password) {
      passport.authenticate('local', { session: false }, (err, user, info) => {
        if (err) {
          return next(err);
        }

        if (!user) {
          return res.status(401).json({
            success: false,
            message: info?.message || 'Authentication failed'
          });
        }

        req.user = user;
        return next();
      })(req, res, next);
    } else {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
  })(req, res, next);
};

// Role-based authorization middleware
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Admin only middleware
const requireAdmin = authorize('admin');

// Premium or admin middleware
const requirePremium = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'premium_user') {
    return res.status(403).json({
      success: false,
      message: 'Premium subscription required'
    });
  }

  next();
};

// Optional authentication (doesn't fail if no user)
const optionalAuth = passport.authenticate('jwt', { session: false });

// Two-factor authentication check
const require2FA = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  if (req.user.twoFactorEnabled && !req.user.twoFactorVerified) {
    return res.status(403).json({
      success: false,
      message: 'Two-factor authentication required',
      requires2FA: true
    });
  }

  next();
};

// Resource ownership check
const requireOwnership = (modelName) => {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const model = require('../models')[modelName];

      if (!model) {
        return res.status(500).json({
          success: false,
          message: 'Invalid model'
        });
      }

      const resource = await model.findByPk(id);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: `${modelName} not found`
        });
      }

      if (resource.userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  authenticate,
  authenticateJWT,
  authenticateLocal,
  authorize,
  requireAdmin,
  requirePremium,
  optionalAuth,
  require2FA,
  requireOwnership
};
