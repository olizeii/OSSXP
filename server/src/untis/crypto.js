/**
 * Symmetrische Verschlüsselung der Untis-Passwörter (AES-256-GCM).
 * Das Passwort muss reversibel gespeichert werden, weil der Server sich damit bei WebUntis anmeldet.
 * Format: base64(iv).base64(authTag).base64(ciphertext)
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

const KEY = crypto.createHash('sha256').update(config.untis.secret).digest(); // 32 Byte

export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, data] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
