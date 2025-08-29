# ShareVault API Documentation

## Overview

ShareVault is a comprehensive file-sharing platform API built with Node.js, Express.js, and PostgreSQL. This documentation provides detailed information about all available endpoints, their parameters, authentication requirements, and response formats.

## Base URL
```
http://localhost:5000/api
```

## Authentication

Most endpoints require authentication using JWT tokens. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

### Authentication Endpoints

#### POST /auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully. Please check your email for verification.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "isVerified": false
  }
}
```

#### POST /auth/login
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "twoFactorToken": "123456" // Optional, if 2FA enabled
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user",
    "avatar": null,
    "storageUsage": {
      "used": 0,
      "limit": 1073741824,
      "percentage": 0
    }
  }
}
```

#### POST /auth/verify-email
Verify user email address.

**Request Body:**
```json
{
  "token": "verification_token"
}
```

#### POST /auth/forgot-password
Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### POST /auth/reset-password
Reset password using reset token.

**Request Body:**
```json
{
  "token": "reset_token",
  "password": "newpassword123"
}
```

#### POST /auth/setup-2fa
Setup two-factor authentication.

**Auth Required:** Yes

**Response (200):**
```json
{
  "success": true,
  "message": "Two-factor authentication setup initiated",
  "secret": "base32_secret",
  "qrCode": "data_url"
}
```

#### POST /auth/verify-2fa
Verify and enable two-factor authentication.

**Auth Required:** Yes

**Request Body:**
```json
{
  "token": "123456"
}
```

#### POST /auth/disable-2fa
Disable two-factor authentication.

**Auth Required:** Yes

**Request Body:**
```json
{
  "token": "123456"
}
```

#### GET /auth/google
Initiate Google OAuth login.

#### GET /auth/github
Initiate GitHub OAuth login.

## File Management

### Upload Files

#### POST /files/upload
Upload a single file.

**Auth Required:** Yes

**Content-Type:** multipart/form-data

**Form Data:**
- `file`: File to upload
- `folderId`: (optional) Folder ID to upload to
- `description`: (optional) File description
- `tags`: (optional) JSON array of tags

**Response (201):**
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "file": {
    "id": "uuid",
    "originalName": "document.pdf",
    "size": 1024000,
    "mimeType": "application/pdf",
    "thumbnailPath": "/uploads/thumbnails/uuid.jpg",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

#### POST /files/upload-multiple
Upload multiple files.

**Auth Required:** Yes

**Content-Type:** multipart/form-data

**Form Data:**
- `files`: Array of files to upload
- `folderId`: (optional) Folder ID to upload to
- `description`: (optional) Files description
- `tags`: (optional) JSON array of tags

### File Operations

#### GET /files
Get user's files with pagination.

**Auth Required:** Yes

**Query Parameters:**
- `folderId`: (optional) Filter by folder
- `page`: (optional) Page number (default: 1)
- `limit`: (optional) Items per page (default: 20)

**Response (200):**
```json
{
  "success": true,
  "files": [
    {
      "id": "uuid",
      "originalName": "document.pdf",
      "size": 1024000,
      "mimeType": "application/pdf",
      "thumbnailPath": "/uploads/thumbnails/uuid.jpg",
      "createdAt": "2025-01-01T00:00:00.000Z",
      "folder": {
        "id": "uuid",
        "name": "Documents"
      }
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "pages": 5,
    "limit": 20
  }
}
```

#### GET /files/:id
Get file details.

**Auth Required:** Yes

**Path Parameters:**
- `id`: File ID

#### GET /files/:id/download
Download a file.

**Auth Required:** Yes

**Path Parameters:**
- `id`: File ID

#### PUT /files/:id
Update file metadata.

**Auth Required:** Yes

**Path Parameters:**
- `id`: File ID

**Request Body:**
```json
{
  "description": "Updated description",
  "tags": ["tag1", "tag2"]
}
```

#### DELETE /files/:id
Delete a file (soft delete).

**Auth Required:** Yes

**Path Parameters:**
- `id`: File ID

#### GET /files/search
Search files.

**Auth Required:** Yes

**Query Parameters:**
- `q`: Search query (required)
- `mimeType`: (optional) Filter by MIME type
- `folderId`: (optional) Filter by folder

#### POST /files/:id/share
Create share link for file.

**Auth Required:** Yes

**Path Parameters:**
- `id`: File ID

**Request Body:**
```json
{
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "password": "sharepassword",
  "maxDownloads": 100,
  "permissions": "read"
}
```

## Folder Management

#### POST /folders
Create a new folder.

**Auth Required:** Yes

**Request Body:**
```json
{
  "name": "New Folder",
  "parentId": "uuid", // Optional
  "description": "Folder description"
}
```

#### GET /folders
Get user's folders.

**Auth Required:** Yes

**Query Parameters:**
- `parentId`: (optional) Parent folder ID
- `page`: (optional) Page number
- `limit`: (optional) Items per page

#### GET /folders/:id
Get folder details.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Folder ID

#### GET /folders/:id/contents
Get folder contents (files and subfolders).

**Auth Required:** Yes

**Path Parameters:**
- `id`: Folder ID

#### PUT /folders/:id
Update folder.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Folder ID

**Request Body:**
```json
{
  "name": "Updated Name",
  "description": "Updated description",
  "color": "#FF5733",
  "icon": "folder"
}
```

#### DELETE /folders/:id
Delete folder.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Folder ID

#### POST /folders/:id/share
Create share link for folder.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Folder ID

**Request Body:**
```json
{
  "expiresAt": "2025-12-31T23:59:59.000Z",
  "password": "sharepassword",
  "maxDownloads": 100,
  "permissions": "read"
}
```

#### GET /folders/tree/structure
Get folder tree structure.

**Auth Required:** Yes

## Sharing System

#### GET /shares/:token
Get share link details.

**Path Parameters:**
- `token`: Share token

#### POST /shares/:token/access
Access protected share link.

**Path Parameters:**
- `token`: Share token

**Request Body:**
```json
{
  "password": "sharepassword"
}
```

#### GET /shares/:token/download
Download shared file.

**Path Parameters:**
- `token`: Share token

**Query Parameters:**
- `password`: (optional) Share password

#### GET /shares/:token/folder
Get shared folder contents.

**Path Parameters:**
- `token`: Share token

**Query Parameters:**
- `password`: (optional) Share password

#### GET /shares/:token/zip
Download shared folder as ZIP.

**Path Parameters:**
- `token`: Share token

**Query Parameters:**
- `password`: (optional) Share password

#### GET /shares/user/links
Get user's share links.

**Auth Required:** Yes

#### DELETE /shares/:id
Delete share link.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Share link ID

## User Management

#### GET /users/profile
Get user profile.

**Auth Required:** Yes

#### PUT /users/profile
Update user profile.

**Auth Required:** Yes

**Request Body:**
```json
{
  "name": "Updated Name",
  "bio": "Updated bio",
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}
```

#### POST /users/avatar
Upload user avatar.

**Auth Required:** Yes

**Content-Type:** multipart/form-data

**Form Data:**
- `avatar`: Avatar image file

#### POST /users/change-password
Change user password.

**Auth Required:** Yes

**Request Body:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

#### GET /users/storage
Get user storage usage.

**Auth Required:** Yes

#### POST /users/follow/:userId
Follow a user.

**Auth Required:** Yes

**Path Parameters:**
- `userId`: User ID to follow

#### GET /users/:id
Get user public profile.

**Path Parameters:**
- `id`: User ID

#### GET /users/search
Search users.

**Query Parameters:**
- `q`: Search query (required)

## Payment System

#### POST /payments/create-intent
Create payment intent.

**Auth Required:** Yes

**Request Body:**
```json
{
  "amount": 9.99,
  "currency": "usd",
  "description": "Premium subscription"
}
```

#### POST /payments/subscribe
Create subscription.

**Auth Required:** Yes

**Request Body:**
```json
{
  "priceId": "price_1234567890",
  "planName": "premium"
}
```

#### GET /payments/subscription
Get current subscription.

**Auth Required:** Yes

#### POST /payments/subscription/cancel
Cancel subscription.

**Auth Required:** Yes

#### GET /payments/history
Get payment history.

**Auth Required:** Yes

**Query Parameters:**
- `page`: (optional) Page number
- `limit`: (optional) Items per page

#### POST /payments/refund/:paymentId
Refund payment.

**Auth Required:** Yes

**Path Parameters:**
- `paymentId`: Payment ID

**Request Body:**
```json
{
  "amount": 9.99,
  "reason": "Customer request"
}
```

#### POST /payments/webhook
Stripe webhook handler.

**Headers:**
- `stripe-signature`: Webhook signature

#### POST /payments/customer-portal
Create customer portal session.

**Auth Required:** Yes

#### GET /payments/plans
Get available subscription plans.

## Notifications

#### GET /notifications
Get user notifications.

**Auth Required:** Yes

**Query Parameters:**
- `page`: (optional) Page number
- `limit`: (optional) Items per page
- `unreadOnly`: (optional) Show only unread notifications

#### PUT /notifications/:id/read
Mark notification as read.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Notification ID

#### PUT /notifications/read-all
Mark all notifications as read.

**Auth Required:** Yes

#### DELETE /notifications/:id
Delete notification.

**Auth Required:** Yes

**Path Parameters:**
- `id`: Notification ID

#### GET /notifications/count
Get unread notifications count.

**Auth Required:** Yes

#### POST /notifications/create
Create notification.

**Auth Required:** Yes

**Request Body:**
```json
{
  "type": "info",
  "title": "Welcome",
  "message": "Welcome to ShareVault!",
  "priority": "medium",
  "actionUrl": "/dashboard",
  "actionText": "Go to Dashboard"
}
```

## Admin Panel

### Dashboard

#### GET /admin/dashboard
Get admin dashboard data.

**Auth Required:** Yes (Admin only)

### User Management

#### GET /admin/users
Get all users.

**Auth Required:** Yes (Admin only)

**Query Parameters:**
- `page`: (optional) Page number
- `limit`: (optional) Items per page
- `search`: (optional) Search term
- `role`: (optional) Filter by role
- `status`: (optional) Filter by status

#### PUT /admin/users/:id
Update user.

**Auth Required:** Yes (Admin only)

**Path Parameters:**
- `id`: User ID

**Request Body:**
```json
{
  "role": "premium_user",
  "isActive": true,
  "storageLimit": 107374182400
}
```

#### POST /admin/users/:id/ban
Ban user.

**Auth Required:** Yes (Admin only)

**Path Parameters:**
- `id`: User ID

**Request Body:**
```json
{
  "reason": "Violation of terms"
}
```

### File Management

#### GET /admin/files
Get all files.

**Auth Required:** Yes (Admin only)

**Query Parameters:**
- `page`: (optional) Page number
- `limit`: (optional) Items per page
- `search`: (optional) Search term
- `userId`: (optional) Filter by user

#### DELETE /admin/files/:id/delete
Delete file (admin).

**Auth Required:** Yes (Admin only)

**Path Parameters:**
- `id`: File ID

### Reports

#### GET /admin/reports
Get all reports.

**Auth Required:** Yes (Admin only)

**Query Parameters:**
- `page`: (optional) Page number
- `limit`: (optional) Items per page
- `status`: (optional) Filter by status
- `type`: (optional) Filter by type

#### POST /admin/reports/:id/resolve
Resolve report.

**Auth Required:** Yes (Admin only)

**Path Parameters:**
- `id`: Report ID

**Request Body:**
```json
{
  "action": "File removed",
  "notes": "Content violation"
}
```

### System Logs

#### GET /admin/logs
Get system logs.

**Auth Required:** Yes (Admin only)

**Query Parameters:**
- `page`: (optional) Page number
- `limit`: (optional) Items per page
- `userId`: (optional) Filter by user
- `action`: (optional) Filter by action
- `category`: (optional) Filter by category
- `severity`: (optional) Filter by severity

#### GET /admin/stats
Get detailed statistics.

**Auth Required:** Yes (Admin only)

**Query Parameters:**
- `startDate`: (optional) Start date
- `endDate`: (optional) End date

## Health Check

#### GET /health
Health check endpoint.

**Response (200):**
```json
{
  "status": "OK",
  "message": "ShareVault API is running"
}
```

## Error Responses

All endpoints may return the following error responses:

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Rate Limiting

The API implements rate limiting to prevent abuse:
- General endpoints: 100 requests per 15 minutes per IP
- Authentication endpoints: 5 requests per 15 minutes per IP
- File upload endpoints: 10 requests per hour per user

## File Upload Limits

- Maximum file size: 100MB per file
- Maximum files per upload: 10 files
- Supported formats: All file types
- Storage limits vary by user plan

## Data Types

### User Roles
- `user`: Basic user (default)
- `premium_user`: Premium subscriber
- `admin`: Administrator

### File Permissions
- `read`: Can view/download
- `write`: Can modify
- `admin`: Full access

### Notification Types
- `info`: General information
- `warning`: Warning message
- `error`: Error notification
- `success`: Success notification

### Report Types
- `spam`: Spam content
- `inappropriate`: Inappropriate content
- `copyright`: Copyright violation
- `other`: Other issues

## WebSocket Events

The API supports real-time communication via WebSocket for:
- File upload progress
- Real-time notifications
- Live collaboration features

## SDKs and Libraries

- **JavaScript/Node.js**: Official SDK available
- **Python**: Community SDK
- **Mobile**: iOS and Android SDKs in development

## Changelog

### Version 1.0.0
- Initial release
- Basic file upload/download
- User authentication
- Folder management
- Sharing system
- Payment integration
- Admin panel

## Support

For API support, please contact:
- Email: support@sharevault.com
- Documentation: https://docs.sharevault.com
- GitHub Issues: https://github.com/yourusername/sharevault/issues

## License

This API documentation is licensed under the MIT License.
