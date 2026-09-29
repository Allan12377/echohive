import { randomUUID } from 'crypto';
import path from 'path';
import multer, { FileFilterCallback } from 'multer';
import { RequestHandler } from 'express';
import { uploadDirectory } from '@config/uploads';

const avatarMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const safeExtensions = new Set([
  '.aac', '.avif', '.csv', '.doc', '.docx', '.flac', '.gif', '.heic', '.jpeg', '.jpg', '.m4a', '.m4v', '.mov', '.mp3',
  '.mp4', '.mpeg', '.ogg', '.pdf', '.png', '.ppt', '.pptx', '.rtf', '.txt', '.wav', '.webm',
  '.webp', '.xls', '.xlsx', '.zip', '.glb',
]);
const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${randomUUID()}${safeExtensions.has(extension) ? extension : ''}`);
  },
});

function receiveSingleFile(maxFileSize: number, imageOnly = false): RequestHandler {
  const upload = multer({
    storage,
    limits: { fileSize: maxFileSize, files: 1 },
    fileFilter: (_req, file, callback: FileFilterCallback) => {
      if (imageOnly && !avatarMimeTypes.has(file.mimetype)) {
        callback(new Error('Choose a JPEG, PNG, WebP, or GIF image'));
        return;
      }
      callback(null, true);
    },
  }).single('file');

  return (req, res, next) => {
    upload(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File is too large' });
      }
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not receive file' });
    });
  };
}

export const receiveAvatar = receiveSingleFile(5 * 1024 * 1024, true);
export const receiveAttachment = receiveSingleFile(50 * 1024 * 1024);

export const receiveVideoChunk: RequestHandler = (req, res, next) => {
  multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single('chunk')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Video chunks must be 5 MB or smaller' });
    }
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Could not receive video chunk' });
  });
};
