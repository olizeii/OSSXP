/**
 * NewsXP – Neuigkeiten & Poster. Lesen darf jeder, veröffentlichen nur Admins (ADMIN_USERNAMES).
 *   GET    /api/news                 neueste zuerst
 *   GET    /api/news/:id/image       Bild/Poster zur Nachricht
 *   POST   /api/news                 multipart: title, body, image?   (Admin)
 *   DELETE /api/news/:id                                               (Admin)
 */
import path from 'node:path';
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';
import { createUpload, handleUpload, removeFile, uploadRoot } from '../uploads.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS news (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL DEFAULT '',
    image_path TEXT,
    image_mime TEXT,
    author_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
`);

const stmt = {
  list: db.prepare('SELECT n.*, u.username, u.color FROM news n LEFT JOIN users u ON u.id = n.author_id ORDER BY n.created_at DESC LIMIT 100'),
  get: db.prepare('SELECT * FROM news WHERE id = ?'),
  insert: db.prepare('INSERT INTO news (title, body, image_path, image_mime, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  remove: db.prepare('DELETE FROM news WHERE id = ?'),
};

export const newsRouter = Router();
const upload = createUpload('news', 8, ['image/png', 'image/jpeg', 'image/webp']);

newsRouter.get('/', (_req, res) => {
  res.json({
    items: stmt.list.all().map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      hasImage: Boolean(n.image_path),
      createdAt: n.created_at,
      author: n.username ? { username: n.username, color: n.color } : null,
    })),
  });
});

newsRouter.get('/:id/image', (req, res) => {
  const item = stmt.get.get(Number(req.params.id));
  if (!item?.image_path) return res.status(404).end();
  res.type(item.image_mime).sendFile(path.join(uploadRoot, 'news', path.basename(item.image_path)));
});

newsRouter.post('/', requireAdmin, handleUpload(upload.single('image')), (req, res) => {
  const title = String(req.body.title ?? '').trim();
  const body = String(req.body.body ?? '').trim();
  if (title.length < 3 || title.length > 150) {
    removeFile(req.file);
    return res.status(400).json({ error: 'Der Titel muss 3–150 Zeichen lang sein.' });
  }
  const id = stmt.insert.run(title, body.slice(0, 20_000), req.file?.filename ?? null, req.file?.mimetype ?? null, req.user.id, Date.now()).lastInsertRowid;
  res.status(201).json({ id: Number(id) });
});

newsRouter.delete('/:id', requireAdmin, (req, res) => {
  const item = stmt.get.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Nicht gefunden.' });
  stmt.remove.run(item.id);
  if (item.image_path) removeFile({ path: path.join(uploadRoot, 'news', path.basename(item.image_path)) });
  res.json({ ok: true });
});
