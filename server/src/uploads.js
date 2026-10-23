/**
 * Datei-Uploads (MollyXP, NewsXP) mit multer: auf die Festplatte unter UPLOAD_DIR/<bereich>/,
 * zufällige Dateinamen, Größen- und Typ-Prüfung.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from './config.js';

export const uploadRoot = path.resolve(config.uploadDir);

const EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/webm': '.webm',
  'video/mp4': '.mp4',
};

/**
 * @param {string} area      Unterordner, z. B. "molly"
 * @param {number} maxMb     maximale Dateigröße
 * @param {string[]} types   erlaubte MIME-Typen
 */
export function createUpload(area, maxMb, types) {
  const dir = path.join(uploadRoot, area);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSIONS[file.mimetype] ?? ''}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) =>
      types.includes(file.mimetype) ? cb(null, true) : cb(new Error('Dieser Dateityp ist hier nicht erlaubt.')),
  });
}

/** Multer-Middleware ausführen und Fehler als 400 mit deutscher Meldung beantworten. */
export const handleUpload = (middleware) => (req, res, next) =>
  middleware(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Die Datei ist zu groß.' : err.message;
    res.status(400).json({ error: message });
  });

export const removeFile = (file) => file?.path && fs.promises.unlink(file.path).catch(() => {});
