import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sizeOf from 'image-size';
import { Request } from 'express';

const isServerlessEnv = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const defaultUploadDir = isServerlessEnv ? '/tmp/uploads' : './uploads';
const rawUploadDir = process.env.UPLOAD_DIR || defaultUploadDir;
let UPLOAD_DIR = path.isAbsolute(rawUploadDir) ? rawUploadDir : path.resolve(process.cwd(), rawUploadDir);

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch {
  // If filesystem is read-only, fallback to /tmp/uploads
  UPLOAD_DIR = '/tmp/uploads';
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  } catch {
    // Ignore if directory creation fails in restricted environment
  }
}

// STORAGE_DRIVER validation (supports 'local' file storage by default)
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';
if (STORAGE_DRIVER !== 'local') {
  console.info(`[STORAGE] Configured STORAGE_DRIVER is "${STORAGE_DRIVER}". Using local filesystem adapter for media uploads at: ${UPLOAD_DIR}`);
}

// Allowed MIME types and extensions
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req: Request, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed.'));
    }
    cb(null, true);
  },
});

export interface ValidatedImageInfo {
  filename: string;
  url: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export function validateAndProcessImage(file: Express.Multer.File): ValidatedImageInfo {
  const filePath = file.path;
  const buffer = fs.readFileSync(filePath);
  
  // Inspect image dimensions and format with image-size
  let dimensions;
  try {
    dimensions = sizeOf(buffer);
  } catch (err) {
    // Corrupt or disguised binary
    fs.unlinkSync(filePath);
    throw new Error('Uploaded file is corrupted or not a valid image format.');
  }

  if (!dimensions || !dimensions.width || !dimensions.height) {
    fs.unlinkSync(filePath);
    throw new Error('Unable to determine image dimensions.');
  }

  // Dimension boundaries: minimum 50x50, maximum 8000x8000
  if (dimensions.width < 50 || dimensions.height < 50) {
    fs.unlinkSync(filePath);
    throw new Error('Image dimensions too small. Minimum is 50x50 pixels.');
  }
  if (dimensions.width > 8000 || dimensions.height > 8000) {
    fs.unlinkSync(filePath);
    throw new Error('Image dimensions too large. Maximum is 8000x8000 pixels.');
  }

  const publicUrl = `/uploads/${file.filename}`;

  return {
    filename: file.filename,
    url: publicUrl,
    width: dimensions.width,
    height: dimensions.height,
    format: dimensions.type || 'unknown',
    sizeBytes: file.size,
  };
}

export function deleteFileSafely(filename: string): void {
  try {
    const safeFilename = path.basename(filename);
    const targetPath = path.join(UPLOAD_DIR, safeFilename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  } catch (err) {
    console.error(`[STORAGE] Error deleting file ${filename}:`, err);
  }
}
