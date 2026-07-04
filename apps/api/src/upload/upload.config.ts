import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomBytes } from 'crypto';

export const UPLOAD_DIR = './uploads';
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|avif)$/;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Minimal shape of a multer upload — avoids depending on @types/multer.
export interface UploadedImage {
  filename: string;
  mimetype: string;
  size: number;
}

// Shared FileInterceptor options: random filename, image-only, 5 MB cap.
export const imageUploadOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const name = randomBytes(12).toString('hex') + extname(file.originalname).toLowerCase();
      cb(null, name);
    },
  }),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req: unknown, file: { mimetype: string }, cb: (e: Error | null, ok: boolean) => void) => {
    cb(null, ALLOWED_IMAGE.test(file.mimetype));
  },
};
