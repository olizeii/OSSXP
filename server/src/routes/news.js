/**
 * NewsXP – Neuigkeiten & Poster mit Kommentaren.
 *   GET    /api/news                       Beiträge (angepinnte zuerst)
 *   GET    /api/news/:id/image             Bild/Poster
 *   GET    /api/news/:id/comments          Kommentare zu einem Beitrag
 *   POST   /api/news/:id/comments          { body }                       (Login)
 *   DELETE /api/news/comments/:id          eigener Kommentar oder Moderation
 *   ── Verwaltung (Admin) ──
 *   POST   /api/news                       multipart: title, body, kind (news|poster), pinned, image?
 *   PATCH  /api/news/:id                   multipart: title, body, kind, pinned, image?, removeImage
 *   DELETE /api/news/:id
 *   GET    /api/news/admin/comments        die neuesten Kommentare aller Beiträge
 */
import path from 'node:path';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { award } from '../economy/service.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { can } from '../roles.js';
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
  CREATE TABLE IF NOT EXISTS news_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    news_id    INTEGER NOT NULL REFERENCES news(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
const newsColumns = new Set(db.prepare('PRAGMA table_info(news)').all().map((c) => c.name));
if (!newsColumns.has('kind')) db.exec("ALTER TABLE news ADD COLUMN kind TEXT NOT NULL DEFAULT 'news'");
if (!newsColumns.has('pinned')) db.exec('ALTER TABLE news ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
if (!newsColumns.has('updated_at')) db.exec('ALTER TABLE news ADD COLUMN updated_at INTEGER');

const stmt = {
  list: db.prepare(`
    SELECT n.*, u.username, u.color, (SELECT COUNT(*) FROM news_comments c WHERE c.news_id = n.id) AS comment_count
    FROM news n LEFT JOIN users u ON u.id = n.author_id ORDER BY n.pinned DESC, n.created_at DESC LIMIT 200`),
  get: db.prepare('SELECT * FROM news WHERE id = ?'),
  insert: db.prepare('INSERT INTO news (title, body, kind, pinned, image_path, image_mime, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  update: db.prepare('UPDATE news SET title = ?, body = ?, kind = ?, pinned = ?, image_path = ?, image_mime = ?, updated_at = ? WHERE id = ?'),
  remove: db.prepare('DELETE FROM news WHERE id = ?'),
  comments: db.prepare('SELECT c.*, u.username, u.color FROM news_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.news_id = ? ORDER BY c.created_at'),
  comment: db.prepare('SELECT * FROM news_comments WHERE id = ?'),
  insertComment: db.prepare('INSERT INTO news_comments (news_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
  removeComment: db.prepare('DELETE FROM news_comments WHERE id = ?'),
  recentComments: db.prepare(`
    SELECT c.*, u.username, u.color, n.title AS news_title FROM news_comments c
    LEFT JOIN users u ON u.id = c.user_id JOIN news n ON n.id = c.news_id ORDER BY c.created_at DESC LIMIT 200`),
};

export const newsRouter = Router();
const upload = createUpload('news', 8, ['image/png', 'image/jpeg', 'image/webp']);
const commentLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Langsamer bitte.' } });

const toNews = (n) => ({
  id: n.id,
  title: n.title,
  body: n.body,
  kind: n.kind,
  pinned: Boolean(n.pinned),
  hasImage: Boolean(n.image_path),
  createdAt: n.created_at,
  updatedAt: n.updated_at,
  commentCount: n.comment_count ?? 0,
  author: n.username ? { username: n.username, color: n.color } : null,
});

const toComment = (c, user) => ({
  id: c.id,
  newsId: c.news_id,
  newsTitle: c.news_title,
  body: c.body,
  createdAt: c.created_at,
  author: c.username ? { username: c.username, color: c.color } : null,
  canDelete: Boolean(user && (user.id === c.user_id || can(user, 'moderate'))),
});

const imageFile = (p) => path.join(uploadRoot, 'news', path.basename(p));

newsRouter.get('/', (_req, res) => res.json({ items: stmt.list.all().map(toNews) }));

newsRouter.get('/admin/comments', requireAdmin, (req, res) => {
  res.json({ comments: stmt.recentComments.all().map((c) => toComment(c, req.user)) });
});

newsRouter.get('/:id/image', (req, res) => {
  const item = stmt.get.get(Number(req.params.id));
  if (!item?.image_path) return res.status(404).end();
  res.type(item.image_mime).sendFile(imageFile(item.image_path));
});

newsRouter.get('/:id/comments', (req, res) => {
  res.json({ comments: stmt.comments.all(Number(req.params.id)).map((c) => toComment(c, req.user)) });
});

newsRouter.post('/:id/comments', requireAuth, commentLimiter, (req, res) => {
  const news = stmt.get.get(Number(req.params.id));
  const body = String(req.body?.body ?? '').trim();
  if (!news) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
  if (!body || body.length > 2000) return res.status(400).json({ error: 'Kommentar: 1–2000 Zeichen.' });
  const id = stmt.insertComment.run(news.id, req.user.id, body, Date.now()).lastInsertRowid;
  award(req.user.id, 'news.comment', id);
  res.status(201).json({ id: Number(id) });
});

newsRouter.delete('/comments/:id', requireAuth, (req, res) => {
  const c = stmt.comment.get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Nicht gefunden.' });
  if (c.user_id !== req.user.id && !can(req.user, 'moderate')) return res.status(403).json({ error: 'Keine Berechtigung.' });
  stmt.removeComment.run(c.id);
  res.json({ ok: true });
});

/** Felder aus dem Formular prüfen (Titel, Text, Art, angepinnt). */
function readForm(req) {
  const title = String(req.body.title ?? '').trim();
  const body = String(req.body.body ?? '').trim().slice(0, 20_000);
  const kind = req.body.kind === 'poster' ? 'poster' : 'news';
  const pinned = req.body.pinned === 'true' ? 1 : 0;
  if (title.length < 3 || title.length > 150) return { error: 'Der Titel muss 3–150 Zeichen lang sein.' };
  if (kind === 'poster' && !req.file && !req.existingImage) return { error: 'Ein Poster braucht ein Bild.' };
  return { title, body, kind, pinned };
}

newsRouter.post('/', requireAdmin, handleUpload(upload.single('image')), (req, res) => {
  const form = readForm(req);
  if (form.error) return removeFile(req.file), res.status(400).json({ error: form.error });
  const id = stmt.insert.run(form.title, form.body, form.kind, form.pinned, req.file?.filename ?? null, req.file?.mimetype ?? null, req.user.id, Date.now()).lastInsertRowid;
  res.status(201).json({ id: Number(id) });
});

newsRouter.patch('/:id', requireAdmin, handleUpload(upload.single('image')), (req, res) => {
  const item = stmt.get.get(Number(req.params.id));
  if (!item) return removeFile(req.file), res.status(404).json({ error: 'Nicht gefunden.' });
  const removeImage = req.body.removeImage === 'true';
  req.existingImage = item.image_path && !removeImage;
  const form = readForm(req);
  if (form.error) return removeFile(req.file), res.status(400).json({ error: form.error });

  let imagePath = item.image_path;
  let imageMime = item.image_mime;
  if (req.file || removeImage) {
    if (item.image_path) removeFile({ path: imageFile(item.image_path) });
    imagePath = req.file?.filename ?? null;
    imageMime = req.file?.mimetype ?? null;
  }
  stmt.update.run(form.title, form.body, form.kind, form.pinned, imagePath, imageMime, Date.now(), item.id);
  res.json({ ok: true });
});

newsRouter.delete('/:id', requireAdmin, (req, res) => {
  const item = stmt.get.get(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Nicht gefunden.' });
  stmt.remove.run(item.id);
  if (item.image_path) removeFile({ path: imageFile(item.image_path) });
  res.json({ ok: true });
});
