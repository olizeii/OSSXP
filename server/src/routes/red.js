/**
 * redXP – Forum mit Subreddits, Beiträgen, verschachtelten Kommentaren und Up-/Downvotes.
 *
 *   GET  /api/red/subs                       alle Subreddits (+ Anzahl Beiträge)
 *   POST /api/red/subs                       { name, title, description }            (Login)
 *   GET  /api/red/posts?sub=&sort=hot|new|top
 *   POST /api/red/posts                      { sub, title, body }                     (Login)
 *   GET  /api/red/posts/:id                  Beitrag + Kommentarbaum
 *   POST /api/red/posts/:id/comments         { body, parentId? }                      (Login)
 *   POST /api/red/vote                       { type: 'post'|'comment', id, value: 1|0|-1 } (Login)
 *
 * Economy: Beitrag → red.post, Kommentar → red.comment,
 * erhaltener Upvote → red.upvote_received für den Autor (einmal pro Wähler und Beitrag/Kommentar).
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db.js';
import { award } from '../economy/service.js';
import { requireAuth } from '../middleware/auth.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS red_subs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    title       TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS red_posts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sub_id        INTEGER NOT NULL REFERENCES red_subs(id) ON DELETE CASCADE,
    user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title         TEXT    NOT NULL,
    body          TEXT    NOT NULL DEFAULT '',
    score         INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_red_posts_sub ON red_posts(sub_id, created_at);
  CREATE TABLE IF NOT EXISTS red_comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES red_posts(id) ON DELETE CASCADE,
    parent_id  INTEGER REFERENCES red_comments(id) ON DELETE CASCADE,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    body       TEXT    NOT NULL,
    score      INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_red_comments_post ON red_comments(post_id);
  CREATE TABLE IF NOT EXISTS red_votes (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT    NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id   INTEGER NOT NULL,
    value       INTEGER NOT NULL CHECK (value IN (-1, 1)),
    PRIMARY KEY (user_id, target_type, target_id)
  );
`);

// Standard-Subreddits (HTL Hollabrunn als Startpunkt)
const seed = db.prepare('INSERT OR IGNORE INTO red_subs (name, title, description, created_at) VALUES (?, ?, ?, ?)');
for (const [name, title, description] of [
  ['allgemein', 'Allgemein', 'Alles rund um OSSXP und die Schule.'],
  ['htlhl', 'HTL Hollabrunn', 'Neuigkeiten, Fragen und Diskussionen zur HTL-HL.'],
  ['hilfe', 'Hilfe & Lernen', 'Fragen zu Hausübungen, Tests und Projekten.'],
  ['memes', 'Memes', 'Für die Pausen.'],
]) {
  seed.run(name, title, description, Date.now());
}

const USER_COLS = 'u.username AS author, u.color AS author_color';
const stmt = {
  subs: db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM red_posts p WHERE p.sub_id = s.id) AS post_count FROM red_subs s ORDER BY s.id`),
  subByName: db.prepare('SELECT * FROM red_subs WHERE name = ?'),
  insertSub: db.prepare('INSERT INTO red_subs (name, title, description, created_by, created_at) VALUES (?, ?, ?, ?, ?)'),
  posts: db.prepare(`
    SELECT p.*, s.name AS sub, ${USER_COLS} FROM red_posts p
    JOIN red_subs s ON s.id = p.sub_id LEFT JOIN users u ON u.id = p.user_id
    WHERE (@sub IS NULL OR s.name = @sub) ORDER BY p.created_at DESC LIMIT 300`),
  post: db.prepare(`SELECT p.*, s.name AS sub, ${USER_COLS} FROM red_posts p JOIN red_subs s ON s.id = p.sub_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`),
  insertPost: db.prepare('INSERT INTO red_posts (sub_id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)'),
  comments: db.prepare(`SELECT c.*, ${USER_COLS} FROM red_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at`),
  comment: db.prepare('SELECT * FROM red_comments WHERE id = ?'),
  insertComment: db.prepare('INSERT INTO red_comments (post_id, parent_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)'),
  bumpComments: db.prepare('UPDATE red_posts SET comment_count = comment_count + 1 WHERE id = ?'),
  vote: db.prepare('SELECT value FROM red_votes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  myVotes: db.prepare('SELECT target_type, target_id, value FROM red_votes WHERE user_id = ?'),
  upsertVote: db.prepare(
    'INSERT INTO red_votes (user_id, target_type, target_id, value) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET value = excluded.value',
  ),
  deleteVote: db.prepare('DELETE FROM red_votes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  scorePost: db.prepare('UPDATE red_posts SET score = score + ? WHERE id = ?'),
  scoreComment: db.prepare('UPDATE red_comments SET score = score + ? WHERE id = ?'),
};

export const redRouter = Router();

const writeLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Langsamer bitte.' } });
const SUB_NAME_RE = /^[a-z0-9_]{2,24}$/i;

/** Hot-Ranking wie bei Reddit: Punkte werden mit dem Alter schwächer. */
const hot = (p) => (p.score + 1) / Math.pow((Date.now() - p.created_at) / 3_600_000 + 2, 1.5);

function votesFor(userId) {
  if (!userId) return new Map();
  return new Map(stmt.myVotes.all(userId).map((v) => [`${v.target_type}:${v.target_id}`, v.value]));
}

const toPost = (p, votes) => ({
  id: p.id,
  sub: p.sub,
  title: p.title,
  body: p.body,
  score: p.score,
  commentCount: p.comment_count,
  createdAt: p.created_at,
  author: p.author ? { username: p.author, color: p.author_color } : null,
  myVote: votes.get(`post:${p.id}`) ?? 0,
});

redRouter.get('/subs', (_req, res) => {
  res.json({
    subs: stmt.subs.all().map((s) => ({ name: s.name, title: s.title, description: s.description, postCount: s.post_count })),
  });
});

redRouter.post('/subs', requireAuth, writeLimiter, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const title = String(req.body?.title ?? '').trim() || name;
  const description = String(req.body?.description ?? '').trim().slice(0, 300);
  if (!SUB_NAME_RE.test(name)) return res.status(400).json({ error: 'Name: 2–24 Zeichen (Buchstaben, Ziffern, _), z. B. „3AHIT“.' });
  if (stmt.subByName.get(name)) return res.status(409).json({ error: `r/${name} gibt es bereits.` });
  stmt.insertSub.run(name, title.slice(0, 60), description, req.user.id, Date.now());
  res.status(201).json({ sub: { name, title, description, postCount: 0 } });
});

redRouter.get('/posts', (req, res) => {
  const sub = req.query.sub ? String(req.query.sub) : null;
  const sort = ['new', 'top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const votes = votesFor(req.user?.id);
  const rows = stmt.posts.all({ sub });
  rows.sort(sort === 'new' ? (a, b) => b.created_at - a.created_at : sort === 'top' ? (a, b) => b.score - a.score : (a, b) => hot(b) - hot(a));
  res.json({ posts: rows.slice(0, 100).map((p) => toPost(p, votes)) });
});

redRouter.post('/posts', requireAuth, writeLimiter, (req, res) => {
  const sub = stmt.subByName.get(String(req.body?.sub ?? ''));
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  if (!sub) return res.status(404).json({ error: 'Subreddit nicht gefunden.' });
  if (title.length < 3 || title.length > 200) return res.status(400).json({ error: 'Der Titel muss 3–200 Zeichen lang sein.' });
  if (body.length > 10_000) return res.status(400).json({ error: 'Der Text ist zu lang (max. 10 000 Zeichen).' });

  const id = Number(stmt.insertPost.run(sub.id, req.user.id, title, body, Date.now()).lastInsertRowid);
  // Eigenen Beitrag automatisch hochvoten (wie bei Reddit)
  stmt.upsertVote.run(req.user.id, 'post', id, 1);
  stmt.scorePost.run(1, id);
  award(req.user.id, 'red.post', id);
  res.status(201).json({ post: toPost(stmt.post.get(id), votesFor(req.user.id)) });
});

redRouter.get('/posts/:id', (req, res) => {
  const post = stmt.post.get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
  const votes = votesFor(req.user?.id);
  const comments = stmt.comments.all(post.id).map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    body: c.body,
    score: c.score,
    createdAt: c.created_at,
    author: c.author ? { username: c.author, color: c.author_color } : null,
    myVote: votes.get(`comment:${c.id}`) ?? 0,
  }));
  res.json({ post: toPost(post, votes), comments });
});

redRouter.post('/posts/:id/comments', requireAuth, writeLimiter, (req, res) => {
  const post = stmt.post.get(Number(req.params.id));
  const body = String(req.body?.body ?? '').trim();
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
  if (!body || body.length > 5000) return res.status(400).json({ error: 'Kommentar: 1–5000 Zeichen.' });
  if (parentId && stmt.comment.get(parentId)?.post_id !== post.id) return res.status(400).json({ error: 'Ungültige Antwort.' });

  const id = Number(stmt.insertComment.run(post.id, parentId, req.user.id, body, Date.now()).lastInsertRowid);
  stmt.bumpComments.run(post.id);
  stmt.upsertVote.run(req.user.id, 'comment', id, 1);
  stmt.scoreComment.run(1, id);
  award(req.user.id, 'red.comment', id);
  res.status(201).json({ id });
});

const applyVote = db.transaction((userId, type, id, value) => {
  const target = type === 'post' ? stmt.post.get(id) : stmt.comment.get(id);
  if (!target) return null;
  const previous = stmt.vote.get(userId, type, id)?.value ?? 0;
  if (value === 0) stmt.deleteVote.run(userId, type, id);
  else stmt.upsertVote.run(userId, type, id, value);
  const delta = value - previous;
  if (delta) (type === 'post' ? stmt.scorePost : stmt.scoreComment).run(delta, id);
  // Upvote für fremde Inhalte belohnt den Autor – pro Wähler nur einmal
  if (value === 1 && target.user_id && target.user_id !== userId) award(target.user_id, 'red.upvote_received', `${type}:${id}:${userId}`);
  return { score: target.score + delta, myVote: value };
});

redRouter.post('/vote', requireAuth, (req, res) => {
  const type = req.body?.type;
  const id = Number(req.body?.id);
  const value = Number(req.body?.value);
  if (!['post', 'comment'].includes(type) || !Number.isInteger(id) || ![-1, 0, 1].includes(value)) {
    return res.status(400).json({ error: 'Ungültige Stimme.' });
  }
  const result = applyVote(req.user.id, type, id, value);
  if (!result) return res.status(404).json({ error: 'Nicht gefunden.' });
  res.json(result);
});
