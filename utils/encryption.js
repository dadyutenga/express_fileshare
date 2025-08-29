const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = crypto.scryptSync(process.env.ENCRYPTION_KEY, 'salt', 32);
const iv = crypto.randomBytes(16);

class EncryptionUtil {
  // Encrypt data
  static encrypt(text) {
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex')
    };
  }

  // Decrypt data
  static decrypt(encryptedData, ivHex) {
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // Generate secure token
  static generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Hash password (alternative to bcrypt for files)
  static hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return `${salt}:${hash}`;
  }

  // Verify password
  static verifyPassword(password, hashedPassword) {
    const [salt, hash] = hashedPassword.split(':');
    const hashToVerify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === hashToVerify;
  }
}

module.exports = EncryptionUtil;
