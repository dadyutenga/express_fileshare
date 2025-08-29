# ShareVault - File Sharing Platform

A comprehensive file-sharing platform built with Node.js, Express.js, and PostgreSQL.

## Features

### User Authentication & Authorization
- User registration with email verification
- JWT-based authentication
- Password reset functionality
- Role-based access control (user, premium_user, admin)
- OAuth integration (Google, GitHub)
- Two-factor authentication (2FA) with TOTP

### File Management
- Single and multiple file uploads
- File versioning
- File compression (ZIP)
- Image/video thumbnail generation
- Full-text search
- Soft delete with recycle bin
- Folder hierarchy management

### Sharing & Collaboration
- Shareable links with expiration and passwords
- Public/private sharing
- Access permissions (read, write, admin)
- Download limits and analytics

### User Profiles & Social Features
- Profile management
- Activity feeds
- Real-time notifications
- Follow/unfollow system

### Admin Panel
- User management
- File moderation
- System analytics
- Audit logs
- Content reports

### Payment & Subscription
- Stripe integration
- Multiple subscription tiers
- Payment history
- Refund management
- Webhook handling

### Security & Compliance
- Input validation and sanitization
- Rate limiting
- CAPTCHA support
- File encryption
- GDPR compliance
- Virus scanning

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL with Sequelize ORM
- **Authentication**: JWT, Passport.js
- **File Storage**: Local filesystem / AWS S3
- **Payments**: Stripe
- **Real-time**: Socket.io
- **Email**: Nodemailer
- **Caching**: Redis
- **Background Jobs**: Bull
- **Logging**: Winston
- **Documentation**: Swagger

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL
- Redis (optional, for caching)
- AWS S3 account (optional, for cloud storage)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/sharevault.git
   cd sharevault
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   - Copy `.env` file and update the values:
   ```bash
   cp .env.example .env
   ```
   - Update the following variables in `.env`:
     - Database credentials
     - JWT secrets
     - Email service credentials
     - OAuth credentials
     - Stripe keys
     - AWS credentials (if using S3)

4. **Database Setup**
   ```bash
   # Create PostgreSQL database
   createdb sharevault

   # Run migrations
   npm run migrate

   # (Optional) Seed database
   npm run seed
   ```

5. **Redis Setup (Optional)**
   ```bash
   # Install and start Redis
   sudo apt-get install redis-server
   sudo systemctl start redis-server
   ```

## Running the Application

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The server will start on port 5000 (or as specified in `.env`).

## API Documentation

Once the server is running, visit:
- **API Docs**: `http://localhost:5000/api-docs`
- **Health Check**: `http://localhost:5000/health`

## Project Structure

```
sharevault/
├── config/           # Database, Passport, i18n configs
├── controllers/      # Route controllers
├── middleware/       # Custom middleware
├── models/           # Sequelize models
├── routes/           # API routes
├── services/         # Business logic services
├── utils/            # Utility functions
├── uploads/          # File uploads directory
├── logs/             # Application logs
├── tests/            # Test files
├── app.js            # Main application file
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

## Key API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Reset password

### Files
- `POST /api/files/upload` - Upload file
- `GET /api/files` - Get user's files
- `GET /api/files/:id/download` - Download file
- `DELETE /api/files/:id` - Delete file

### Folders
- `POST /api/folders` - Create folder
- `GET /api/folders` - Get folders
- `GET /api/folders/:id/contents` - Get folder contents

### Sharing
- `POST /api/shares/:id/share` - Create share link
- `GET /api/shares/:token` - Access shared content

### Payments
- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/subscribe` - Create subscription
- `GET /api/payments/history` - Payment history

### Admin
- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/users` - User management
- `GET /api/admin/files` - File management

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Deployment

### Heroku
1. Create a Heroku app
2. Set environment variables
3. Deploy using Heroku CLI or GitHub integration

### AWS/DigitalOcean
1. Set up a VPS instance
2. Configure reverse proxy (nginx)
3. Set up SSL certificate
4. Configure process manager (PM2)

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `EMAIL_USER` | SMTP email user | Yes |
| `EMAIL_PASS` | SMTP email password | Yes |
| `STRIPE_SECRET_KEY` | Stripe secret key | Yes |
| `AWS_ACCESS_KEY_ID` | AWS access key | No |
| `REDIS_URL` | Redis connection URL | No |
| `PORT` | Server port | No |

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For support, email support@sharevault.com or create an issue in the repository.

## Roadmap

- [ ] Mobile app development
- [ ] Advanced collaboration features
- [ ] Integration with cloud storage providers
- [ ] Machine learning for content categorization
- [ ] Advanced analytics dashboard
