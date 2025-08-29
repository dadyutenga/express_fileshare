const request = require('supertest');
const app = require('../app');

// Mock the database models
jest.mock('../models', () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn(),
    findByPk: jest.fn()
  },
  Log: {
    create: jest.fn().mockResolvedValue(true)
  }
}));

// Mock the email service
jest.mock('../services/emailService', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  generateToken: jest.fn().mockReturnValue('mock-token')
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock-jwt-token')
}));

const { User, Log } = require('../models');
const jwt = require('jsonwebtoken');

describe('Authentication', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      // Mock user creation
      User.create.mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        isVerified: false,
        verificationToken: 'mock-token'
      });

      User.findOne.mockResolvedValue(null); // No existing user

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(User.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: expect.any(String), // Password should be hashed
        name: 'Test User',
        verificationToken: 'mock-token'
      });
    });

    it('should not register user with existing email', async () => {
      // Mock existing user
      User.findOne.mockResolvedValue({
        id: '123',
        email: 'test@example.com'
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User 2'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(User.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login user with correct credentials', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6P4tHvK1K', // hashed 'password123'
        isVerified: true,
        twoFactorEnabled: false,
        lastLogin: new Date(),
        role: 'user',
        avatar: null,
        getStorageUsage: jest.fn().mockReturnValue({ used: 0, limit: 1073741824, percentage: 0 }),
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(mockUser.comparePassword).toHaveBeenCalledWith('password123');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: '123', email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );
    });

    it('should not login with incorrect password', async () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        password: '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6P4tHvK1K',
        comparePassword: jest.fn().mockResolvedValue(false)
      };

      User.findOne.mockResolvedValue(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(mockUser.comparePassword).toHaveBeenCalledWith('wrongpassword');
    });
  });
});

describe('Health Check', () => {
  it('should return health status', async () => {
    const response = await request(app)
      .get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
  });
});
