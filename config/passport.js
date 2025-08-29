const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const bcrypt = require('bcryptjs');
const { User } = require('../models');

const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET
};

// JWT Strategy
passport.use(new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    const user = await User.findByPk(payload.id);
    if (user) {
      return done(null, user);
    }
    return done(null, false);
  } catch (error) {
    return done(error, false);
  }
}));

// Local Strategy
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

// Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ where: { googleId: profile.id } });
    if (!user) {
      user = await User.findOne({ where: { email: profile.emails[0].value } });
      if (user) {
        user.googleId = profile.id;
        await user.save();
      } else {
        user = await User.create({
          email: profile.emails[0].value,
          name: profile.displayName,
          googleId: profile.id,
          avatar: profile.photos[0].value,
          isVerified: true
        });
      }
    }
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

// GitHub Strategy
passport.use(new GitHubStrategy({
  clientID: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  callbackURL: '/api/auth/github/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({ where: { githubId: profile.id } });
    if (!user) {
      user = await User.findOne({ where: { email: profile.emails[0].value } });
      if (user) {
        user.githubId = profile.id;
        await user.save();
      } else {
        user = await User.create({
          email: profile.emails[0].value,
          name: profile.username,
          githubId: profile.id,
          avatar: profile.photos[0].value,
          isVerified: true
        });
      }
    }
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

module.exports = passport;
