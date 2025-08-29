require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { sequelize } = require('./config/database');
const passport = require('./config/passport');
const i18next = require('./config/i18n');
const i18nextMiddleware = require('i18next-http-middleware');

// Import routes
const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const folderRoutes = require('./routes/folders');
const shareRoutes = require('./routes/shares');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const paymentRoutes = require('./routes/payments');
const notificationRoutes = require('./routes/notifications');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Compression
app.use(compression());

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// i18n middleware
app.use(i18nextMiddleware.handle(i18next));

// Passport middleware
app.use(passport.initialize());

// Swagger documentation
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ShareVault API',
      version: '1.0.0',
      description: 'A comprehensive file-sharing platform API',
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
    ],
  },
  apis: ['./routes/*.js'], // files containing annotations
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/shares', shareRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ShareVault API is running' });
});

// 404 handler
app.use(notFound);

// Error handling middleware
app.use(errorHandler);

// Database sync and server start
const PORT = process.env.PORT || 5000;

// Only sync database if not in test mode
if (process.env.NODE_ENV !== 'test') {
  sequelize.authenticate()
    .then(() => {
      console.log('Database connected successfully.');
      return sequelize.sync({ alter: true }); // Use { force: true } in development to drop and recreate tables
    })
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
      });
    })
    .catch(err => {
      console.error('Unable to connect to the database:', err);
    });
} else {
  // In test mode, just authenticate and let tests handle sync
  sequelize.authenticate()
    .then(() => {
      console.log('Database connected successfully (test mode).');
    })
    .catch(err => {
      console.error('Unable to connect to the database:', err);
    });
}

module.exports = app;
