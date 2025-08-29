const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const archiver = require('archiver');
const crypto = require('crypto');
const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Op } = require('sequelize');
const { File, Folder, Log } = require('../models');

class FileService {
  constructor() {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
    this.useS3 = process.env.STORAGE_TYPE === 's3';
  }

  // Save uploaded file
  async saveFile(file, userId, folderId = null, metadata = {}) {
    const fileData = {
      userId,
      folderId,
      originalName: file.originalname,
      fileName: file.filename || path.basename(file.path),
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
      s3Key: file.key,
      checksum: await this.calculateChecksum(file.path || file.buffer),
      metadata: {
        ...metadata,
        uploadDate: new Date()
      }
    };

    const savedFile = await File.create(fileData);

    // Log the upload
    await Log.create({
      userId,
      action: 'file_upload',
      description: `Uploaded file: ${file.originalname}`,
      category: 'file_management',
      resourceId: savedFile.id,
      metadata: { fileSize: file.size, mimeType: file.mimetype }
    });

    // Generate thumbnail for images/videos
    if (this.isImage(file.mimetype)) {
      await this.generateThumbnail(savedFile);
    }

    return savedFile;
  }

  // Generate thumbnail for images
  async generateThumbnail(file) {
    try {
      const thumbnailPath = path.join(__dirname, '../uploads/thumbnails', `${file.id}.jpg`);

      if (this.useS3) {
        // For S3, we'd need to download, process, and upload back
        // This is a simplified version
        const thumbnailBuffer = await sharp(file.path)
          .resize(300, 300, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();

        const thumbnailKey = `thumbnails/${file.id}.jpg`;
        await this.s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: thumbnailKey,
          Body: thumbnailBuffer,
          ContentType: 'image/jpeg'
        }));

        file.thumbnailPath = thumbnailKey;
      } else {
        await fs.mkdir(path.dirname(thumbnailPath), { recursive: true });
        await sharp(file.path)
          .resize(300, 300, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toFile(thumbnailPath);

        file.thumbnailPath = thumbnailPath;
      }

      await file.save();
    } catch (error) {
      console.error('Error generating thumbnail:', error);
    }
  }

  // Calculate file checksum
  async calculateChecksum(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  // Compress files into ZIP
  async createZip(files, zipName) {
    const zipPath = path.join(__dirname, '../uploads/temp', `${zipName}.zip`);
    await fs.mkdir(path.dirname(zipPath), { recursive: true });

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(zipPath));
      archive.on('error', reject);

      archive.pipe(output);

      files.forEach(file => {
        archive.file(file.path, { name: file.originalName });
      });

      archive.finalize();
    });
  }

  // Delete file
  async deleteFile(fileId, userId) {
    const file = await File.findByPk(fileId);

    if (!file) {
      throw new Error('File not found');
    }

    if (file.userId !== userId) {
      throw new Error('Access denied');
    }

    // Soft delete
    file.isDeleted = true;
    file.deletedAt = new Date();
    await file.save();

    // Log the deletion
    await Log.create({
      userId,
      action: 'file_delete',
      description: `Deleted file: ${file.originalName}`,
      category: 'file_management',
      resourceId: file.id
    });

    return file;
  }

  // Permanently delete file
  async permanentlyDeleteFile(fileId) {
    const file = await File.findByPk(fileId);

    if (!file) return;

    // Delete from storage
    if (this.useS3 && file.s3Key) {
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: file.s3Key
      }));

      if (file.thumbnailPath) {
        await this.s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: file.thumbnailPath
        }));
      }
    } else {
      // Delete from local storage
      try {
        await fs.unlink(file.path);
        if (file.thumbnailPath) {
          await fs.unlink(file.thumbnailPath);
        }
      } catch (error) {
        console.error('Error deleting file from disk:', error);
      }
    }

    await file.destroy();
  }

  // Get file stream for download
  async getFileStream(fileId) {
    const file = await File.findByPk(fileId);

    if (!file) {
      throw new Error('File not found');
    }

    if (this.useS3 && file.s3Key) {
      const command = new GetObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: file.s3Key
      });

      const response = await this.s3Client.send(command);
      return response.Body;
    } else {
      return fs.createReadStream(file.path);
    }
  }

  // Create folder
  async createFolder(name, userId, parentId = null) {
    // Build path
    let folderPath = `/${name}`;
    if (parentId) {
      const parent = await Folder.findByPk(parentId);
      if (!parent) {
        throw new Error('Parent folder not found');
      }
      folderPath = `${parent.path}${folderPath}`;
    }

    const folder = await Folder.create({
      name,
      path: folderPath,
      userId,
      parentId
    });

    // Log folder creation
    await Log.create({
      userId,
      action: 'folder_create',
      description: `Created folder: ${name}`,
      category: 'file_management',
      resourceId: folder.id
    });

    return folder;
  }

  // Get folder contents
  async getFolderContents(folderId, userId) {
    const folder = await Folder.findOne({
      where: { id: folderId, userId }
    });

    if (!folder) {
      throw new Error('Folder not found');
    }

    const [files, subfolders] = await Promise.all([
      File.findAll({
        where: { folderId, isDeleted: false },
        order: [['createdAt', 'DESC']]
      }),
      Folder.findAll({
        where: { parentId: folderId },
        order: [['name', 'ASC']]
      })
    ]);

    return {
      folder,
      files,
      subfolders
    };
  }

  // Search files
  async searchFiles(query, userId, filters = {}) {
    const whereClause = {
      userId,
      isDeleted: false,
      [Op.or]: [
        { originalName: { [Op.iLike]: `%${query}%` } },
        { description: { [Op.iLike]: `%${query}%` } },
        { tags: { [Op.contains]: [query] } }
      ]
    };

    if (filters.mimeType) {
      whereClause.mimeType = filters.mimeType;
    }

    if (filters.folderId) {
      whereClause.folderId = filters.folderId;
    }

    return await File.findAll({
      where: whereClause,
      include: [{ model: Folder, as: 'folder' }],
      order: [['createdAt', 'DESC']]
    });
  }

  // Get storage usage
  async getStorageUsage(userId) {
    const result = await File.sum('size', {
      where: { userId, isDeleted: false }
    });

    return result || 0;
  }

  // Check if file type is image
  isImage(mimeType) {
    return mimeType.startsWith('image/');
  }

  // Check if file type is video
  isVideo(mimeType) {
    return mimeType.startsWith('video/');
  }

  // Validate file size against user limits
  async validateFileSize(userId, fileSize) {
    const { User, Subscription } = require('../models');

    const user = await User.findByPk(userId, {
      include: [{ model: Subscription, as: 'subscription' }]
    });

    const currentUsage = await this.getStorageUsage(userId);
    const limit = user.subscription?.storageLimit || user.storageLimit;

    if (currentUsage + fileSize > limit) {
      throw new Error('Storage limit exceeded');
    }

    return true;
  }
}

module.exports = new FileService();
