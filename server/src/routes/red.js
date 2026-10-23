/**
 * redXP – Forum mit Subreddits, Beiträgen, verschachtelten Kommentaren und Up-/Downvotes.
 *
 *   GET    /api/red/subs                     sichtbare Subreddits (öffentliche + eigene Mitgliedschaften)
 *   GET    /api/red/subs/:name               ein Subreddit – auch private (Zugang per Link)
 *   POST   /api/red/subs                     { name, title, description }   ab „Stammgast“, startet privat
 *   POST   /api/red/subs/:name/join|leave    Mitglied werden / austreten
 *   GET    /api/red/posts?sub=&sort=hot|new|top
 *   POST   /api/red/posts                    { sub, title, body }
 *   GET    /api/red/posts/:id                Beitrag + Kommentarbaum
 *   POST   /api/red/posts/:id/comments       { body, parentId? }
 *   DELETE /api/red/posts/:id · /api/red/comments/:id    Autor:in oder Moderation
 *   POST   /api/red/vote                     { type, id, value: 1|0|-1 }
 *   GET    /api/red/search?q=                Subreddits und Beiträge durchsuchen
 *
 * Private Subreddits tauchen in Listen/Suche nur für Mitglieder auf und werden automatisch
 * öffentlich, sobald sie PUBLIC_AT Mitglieder haben.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db, users } from '../db.js';
import { award, displayBadges } from '../economy/service.js';
import { requireAuth } from '../middleware/auth.js';
import { can, hasRank, rankOf, requireRank } from '../roles.js';

const PUBLIC_AT = 10;

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
  CREATE TABLE IF NOT EXISTS red_members (
    sub_id    INTEGER NOT NULL REFERENCES red_subs(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (sub_id, user_id)
  );
`);

// Neue Spalten für bestehende Datenbanken: sichtbar? offiziell?
const subColumns = new Set(db.prepare('PRAGMA table_info(red_subs)').all().map((c) => c.name));
if (!subColumns.has('listed')) db.exec('ALTER TABLE red_subs ADD COLUMN listed INTEGER NOT NULL DEFAULT 1');
if (!subColumns.has('official')) db.exec('ALTER TABLE red_subs ADD COLUMN official INTEGER NOT NULL DEFAULT 0');

// Standard-Subreddits (offiziell, immer öffentlich)
const seed = db.prepare('INSERT OR IGNORE INTO red_subs (name, title, description, created_at, listed, official) VALUES (?, ?, ?, ?, 1, 1)');
const markOfficial = db.prepare('UPDATE red_subs SET official = 1, listed = 1 WHERE name = ?');
for (const [name, title, description] of [
  ['allgemein', 'Allgemein', 'Alles rund um OSSXP und die Schule.'],
  ['htlhl', 'HTL Hollabrunn', 'Neuigkeiten, Fragen und Diskussionen zur HTL-HL.'],
  ['hilfe', 'Hilfe & Lernen', 'Fragen zu Hausübungen, Tests und Projekten.'],
  ['projekte', 'Projekte & Diplomarbeiten', 'Zeig her, woran du arbeitest – und finde Mitstreiter:innen.'],
  ['marktplatz', 'Marktplatz', 'Biete/Suche: Bücher, Taschenrechner, Nachhilfe.'],
  ['gaming', 'Gaming', 'Zocken in der Freizeit.'],
  ['musik', 'Musik', 'Was läuft gerade auf deinen Kopfhörern?'],
  ['sport', 'Sport', 'Schulsport, Turniere und Vereine.'],
  ['memes', 'Memes', 'Für die Pausen.'],
  ['feedback', 'OSSXP-Feedback', 'Wünsche, Ideen und Fehler rund um OSSXP.'],
]) {
  seed.run(name, title, description, Date.now());
  markOfficial.run(name);
}

const USER_COLS = 'u.id AS author_id, u.username AS author, u.color AS author_color';
const VISIBLE = '(s.listed = 1 OR EXISTS (SELECT 1 FROM red_members m WHERE m.sub_id = s.id AND m.user_id = @userId))';
const stmt = {
  subs: db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM red_posts p WHERE p.sub_id = s.id) AS post_count,
      (SELECT COUNT(*) FROM red_members m WHERE m.sub_id = s.id) AS member_count,
      EXISTS (SELECT 1 FROM red_members m WHERE m.sub_id = s.id AND m.user_id = @userId) AS is_member
    FROM red_subs s WHERE ${VISIBLE} ORDER BY s.official DESC, s.id`),
  subByName: db.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM red_members m WHERE m.sub_id = s.id) AS member_count,
      EXISTS (SELECT 1 FROM red_members m WHERE m.sub_id = s.id AND m.user_id = @userId) AS is_member
    FROM red_subs s WHERE s.name = @name`),
  insertSub: db.prepare('INSERT INTO red_subs (name, title, description, created_by, created_at, listed) VALUES (?, ?, ?, ?, ?, 0)'),
  join: db.prepare('INSERT OR IGNORE INTO red_members (sub_id, user_id, joined_at) VALUES (?, ?, ?)'),
  leave: db.prepare('DELETE FROM red_members WHERE sub_id = ? AND user_id = ?'),
  memberCount: db.prepare('SELECT COUNT(*) AS n FROM red_members WHERE sub_id = ?'),
  publish: db.prepare('UPDATE red_subs SET listed = 1 WHERE id = ?'),
  posts: db.prepare(`
    SELECT p.*, s.name AS sub, ${USER_COLS} FROM red_posts p
    JOIN red_subs s ON s.id = p.sub_id LEFT JOIN users u ON u.id = p.user_id
    WHERE (@sub IS NULL AND ${VISIBLE}) OR s.name = @sub ORDER BY p.created_at DESC LIMIT 300`),
  post: db.prepare(`SELECT p.*, s.name AS sub, ${USER_COLS} FROM red_posts p JOIN red_subs s ON s.id = p.sub_id LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?`),
  insertPost: db.prepare('INSERT INTO red_posts (sub_id, user_id, title, body, created_at) VALUES (?, ?, ?, ?, ?)'),
  deletePost: db.prepare('DELETE FROM red_posts WHERE id = ?'),
  comments: db.prepare(`SELECT c.*, ${USER_COLS} FROM red_comments c LEFT JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at`),
  comment: db.prepare('SELECT * FROM red_comments WHERE id = ?'),
  insertComment: db.prepare('INSERT INTO red_comments (post_id, parent_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)'),
  deleteComment: db.prepare('DELETE FROM red_comments WHERE id = ?'),
  bumpComments: db.prepare('UPDATE red_posts SET comment_count = comment_count + ? WHERE id = ?'),
  vote: db.prepare('SELECT value FROM red_votes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  myVotes: db.prepare('SELECT target_type, target_id, value FROM red_votes WHERE user_id = ?'),
  upsertVote: db.prepare(
    'INSERT INTO red_votes (user_id, target_type, target_id, value) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, target_type, target_id) DO UPDATE SET value = excluded.value',
  ),
  deleteVote: db.prepare('DELETE FROM red_votes WHERE user_id = ? AND target_type = ? AND target_id = ?'),
  scorePost: db.prepare('UPDATE red_posts SET score = score + ? WHERE id = ?'),
  scoreComment: db.prepare('UPDATE red_comments SET score = score + ? WHERE id = ?'),
  searchSubs: db.prepare(`SELECT s.name, s.title, s.description FROM red_subs s WHERE ${VISIBLE} AND (s.name LIKE @q OR s.title LIKE @q OR s.description LIKE @q) LIMIT 10`),
  searchPosts: db.prepare(`
    SELECT p.*, s.name AS sub, ${USER_COLS} FROM red_posts p JOIN red_subs s ON s.id = p.sub_id LEFT JOIN users u ON u.id = p.user_id
    WHERE ${VISIBLE} AND (p.title LIKE @q OR p.body LIKE @q) ORDER BY p.score DESC, p.created_at DESC LIMIT 30`),
};

export const redRouter = Router();

const writeLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Langsamer bitte.' } });
const SUB_NAME_RE = /^[a-z0-9_]{2,24}$/i;
const LINK_RE = /(https?:\/\/|www\.)\S+/i;

/** Hot-Ranking wie bei Reddit: Punkte werden mit dem Alter schwächer. */
const hot = (p) => (p.score + 1) / Math.pow((Date.now() - p.created_at) / 3_600_000 + 2, 1.5);

function votesFor(userId) {
  if (!userId) return new Map();
  return new Map(stmt.myVotes.all(userId).map((v) => [`${v.target_type}:${v.target_id}`, v.value]));
}

/** Autor:innen mit Rang und (dezenten) Abzeichen – pro Anfrage gecacht. */
function authorFactory() {
  const cache = new Map();
  return (row) => {
    if (!row.author) return null;
    if (!cache.has(row.author_id)) {
      const u = users.findById(row.author_id);
      cache.set(row.author_id, {
        username: row.author,
        color: row.author_color,
        rank: u ? rankOf(u) : 'new',
        badges: u ? displayBadges(u.id) : [],
      });
    }
    return cache.get(row.author_id);
  };
}

const canDelete = (user, ownerId) => Boolean(user) && (user.id === ownerId || can(user, 'moderate'));

const toPost = (p, votes, author, user) => ({
  id: p.id,
  sub: p.sub,
  title: p.title,
  body: p.body,
  score: p.score,
  commentCount: p.comment_count,
  createdAt: p.created_at,
  author: author(p),
  myVote: votes.get(`post:${p.id}`) ?? 0,
  canDelete: canDelete(user, p.user_id),
});

const toSub = (s) => ({
  name: s.name,
  title: s.title,
  description: s.description,
  postCount: s.post_count ?? 0,
  members: s.member_count ?? 0,
  isMember: Boolean(s.is_member),
  listed: Boolean(s.listed),
  official: Boolean(s.official),
});

redRouter.get('/subs', (req, res) => {
  res.json({ subs: stmt.subs.all({ userId: req.user?.id ?? -1 }).map(toSub), publicAt: PUBLIC_AT });
});

redRouter.get('/subs/:name', (req, res) => {
  const s = stmt.subByName.get({ name: String(req.params.name), userId: req.user?.id ?? -1 });
  if (!s) return res.status(404).json({ error: 'Dieses Subreddit gibt es nicht.' });
  res.json({ sub: toSub(s), publicAt: PUBLIC_AT });
});

redRouter.post('/subs', requireRank('createSubreddit'), writeLimiter, (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const title = String(req.body?.title ?? '').trim() || name;
  const description = String(req.body?.description ?? '').trim().slice(0, 300);
  if (!SUB_NAME_RE.test(name)) return res.status(400).json({ error: 'Name: 2–24 Zeichen (Buchstaben, Ziffern, _), z. B. „3AHIT“.' });
  if (stmt.subByName.get({ name, userId: -1 })) return res.status(409).json({ error: `r/${name} gibt es bereits.` });
  const id = stmt.insertSub.run(name, title.slice(0, 60), description, req.user.id, Date.now()).lastInsertRowid;
  stmt.join.run(id, req.user.id, Date.now());
  res.status(201).json({ sub: toSub(stmt.subByName.get({ name, userId: req.user.id })), publicAt: PUBLIC_AT });
});

const membership = (join) => (req, res) => {
  const s = stmt.subByName.get({ name: String(req.params.name), userId: req.user.id });
  if (!s) return res.status(404).json({ error: 'Dieses Subreddit gibt es nicht.' });
  if (join) {
    stmt.join.run(s.id, req.user.id, Date.now());
    // Ab PUBLIC_AT Mitgliedern wird ein privates Subreddit automatisch öffentlich
    if (!s.listed && stmt.memberCount.get(s.id).n >= PUBLIC_AT) stmt.publish.run(s.id);
  } else {
    stmt.leave.run(s.id, req.user.id);
  }
  res.json({ sub: toSub(stmt.subByName.get({ name: s.name, userId: req.user.id })) });
};
redRouter.post('/subs/:name/join', requireAuth, membership(true));
redRouter.post('/subs/:name/leave', requireAuth, membership(false));

redRouter.get('/posts', (req, res) => {
  const sub = req.query.sub ? String(req.query.sub) : null;
  const sort = ['new', 'top'].includes(req.query.sort) ? req.query.sort : 'hot';
  const votes = votesFor(req.user?.id);
  const author = authorFactory();
  const rows = stmt.posts.all({ sub, userId: req.user?.id ?? -1 });
  rows.sort(sort === 'new' ? (a, b) => b.created_at - a.created_at : sort === 'top' ? (a, b) => b.score - a.score : (a, b) => hot(b) - hot(a));
  res.json({ posts: rows.slice(0, 100).map((p) => toPost(p, votes, author, req.user)) });
});

redRouter.post('/posts', requireAuth, writeLimiter, (req, res) => {
  const sub = stmt.subByName.get({ name: String(req.body?.sub ?? ''), userId: req.user.id });
  const title = String(req.body?.title ?? '').trim();
  const body = String(req.body?.body ?? '').trim();
  if (!sub) return res.status(404).json({ error: 'Subreddit nicht gefunden.' });
  if (!sub.listed && !sub.is_member) return res.status(403).json({ error: 'Tritt dem Subreddit bei, um zu posten.' });
  if (title.length < 3 || title.length > 200) return res.status(400).json({ error: 'Der Titel muss 3–200 Zeichen lang sein.' });
  if (body.length > 10_000) return res.status(400).json({ error: 'Der Text ist zu lang (max. 10 000 Zeichen).' });
  if (!hasRank(req.user, 'verified') && LINK_RE.test(`${title} ${body}`)) {
    return res.status(403).json({ error: 'Neue Nutzer:innen dürfen noch keine Links posten.' });
  }

  const id = Number(stmt.insertPost.run(sub.id, req.user.id, title, body, Date.now()).lastInsertRowid);
  stmt.upsertVote.run(req.user.id, 'post', id, 1);
  stmt.scorePost.run(1, id);
  award(req.user.id, 'red.post', id);
  res.status(201).json({ post: toPost(stmt.post.get(id), votesFor(req.user.id), authorFactory(), req.user) });
});

redRouter.get('/posts/:id', (req, res) => {
  const post = stmt.post.get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
  const votes = votesFor(req.user?.id);
  const author = authorFactory();
  const comments = stmt.comments.all(post.id).map((c) => ({
    id: c.id,
    parentId: c.parent_id,
    body: c.body,
    score: c.score,
    createdAt: c.created_at,
    author: author(c),
    myVote: votes.get(`comment:${c.id}`) ?? 0,
    canDelete: canDelete(req.user, c.user_id),
  }));
  res.json({ post: toPost(post, votes, author, req.user), comments });
});

redRouter.post('/posts/:id/comments', requireAuth, writeLimiter, (req, res) => {
  const post = stmt.post.get(Number(req.params.id));
  const body = String(req.body?.body ?? '').trim();
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  if (!post) return res.status(404).json({ error: 'Beitrag nicht gefunden.' });
  if (!body || body.length > 5000) return res.status(400).json({ error: 'Kommentar: 1–5000 Zeichen.' });
  if (parentId && stmt.comment.get(parentId)?.post_id !== post.id) return res.status(400).json({ error: 'Ungültige Antwort.' });
  if (!hasRank(req.user, 'verified') && LINK_RE.test(body)) return res.status(403).json({ error: 'Neue Nutzer:innen dürfen noch keine Links posten.' });

  const id = Number(stmt.insertComment.run(post.id, parentId, req.user.id, body, Date.now()).lastInsertRowid);
  stmt.bumpComments.run(1, post.id);
  stmt.upsertVote.run(req.user.id, 'comment', id, 1);
  stmt.scoreComment.run(1, id);
  award(req.user.id, 'red.comment', id);
  res.status(201).json({ id });
});

redRouter.delete('/posts/:id', requireAuth, (req, res) => {
  const post = stmt.post.get(Number(req.params.id));
  if (!post) return res.status(404).json({ error: 'Nicht gefunden.' });
  if (!canDelete(req.user, post.user_id)) return res.status(403).json({ error: 'Keine Berechtigung.' });
  stmt.deletePost.run(post.id);
  res.json({ ok: true });
});

redRouter.delete('/comments/:id', requireAuth, (req, res) => {
  const c = stmt.comment.get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Nicht gefunden.' });
  if (!canDelete(req.user, c.user_id)) return res.status(403).json({ error: 'Keine Berechtigung.' });
  const removed = 1 + db.prepare('SELECT COUNT(*) AS n FROM red_comments WHERE parent_id = ?').get(c.id).n;
  stmt.deleteComment.run(c.id);
  stmt.bumpComments.run(-removed, c.post_id);
  res.json({ ok: true });
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

redRouter.get('/search', (req, res) => {
  const term = String(req.query.q ?? '').trim();
  if (term.length < 2) return res.json({ subs: [], posts: [] });
  const params = { q: `%${term.replace(/[%_]/g, '')}%`, userId: req.user?.id ?? -1 };
  const votes = votesFor(req.user?.id);
  const author = authorFactory();
  res.json({
    subs: stmt.searchSubs.all(params),
    posts: stmt.searchPosts.all(params).map((p) => toPost(p, votes, author, req.user)),
  });
});
