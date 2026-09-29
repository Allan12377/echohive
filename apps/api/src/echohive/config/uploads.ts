import fs from 'fs';
import path from 'path';

export const uploadDirectory = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');

fs.mkdirSync(uploadDirectory, { recursive: true });

export function removeUploadedFile(url?: string | null): void {
  if (!url?.startsWith('/uploads/')) return;

  const filename = path.basename(url);
  fs.promises.unlink(path.join(uploadDirectory, filename)).catch(() => {});
}