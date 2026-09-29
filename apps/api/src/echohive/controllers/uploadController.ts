import { Response } from 'express';
import { AuthedRequest } from '@middleware/auth';

export function uploadAttachment(req: AuthedRequest, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'Choose a file to send' });

  return res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname.slice(0, 255),
    mimeType: req.file.mimetype.slice(0, 150),
    size: req.file.size,
  });
}