/**
 * Profile, Wallet & Shop:
 *   GET    /api/economy/catalog            Abzeichen, Shop-Artikel, Belohnungen, Level-Kurve (öffentlich)
 *   GET    /api/economy/me                 eigenes Wallet, Abzeichen, Inventar, Profil
 *   POST   /api/economy/shop/buy           Artikel kaufen { itemId }
 *   GET    /api/economy/items/:id/image    Bild eines hochgeladenen Artikels
 *   POST   /api/economy/items              eigenen Artikel hochladen (ab Moderator)   multipart: file, type, name, price
 *   DELETE /api/economy/items/:id          hochgeladenen Artikel aus dem Shop nehmen (Moderator)
 *   GET    /api/profiles/:username         öffentliches Profil (Steam-ähnlich)
 *   PATCH  /api/profiles/me                Profil anpassen
 */
import path from 'node:path';
import { Router } from 'express';
import { db, untisLinks, users } from '../db.js';
import {
  addCustomItem,
  buyItem,
  catalog,
  countAction,
  customItemFile,
  getBadges,
  getInventory,
  getProfile,
  getWallet,
  removeCustomItem,
  streakOf,
  updateProfile,
} from '../economy/service.js';
import { requireAuth } from '../middleware/auth.js';
import { RANKS, rankOf, requireRank } from '../roles.js';
import { createUpload, handleUpload, removeFile, uploadRoot } from '../uploads.js';

export const economyRouter = Router();
export const profileRouter = Router();

const itemUpload = createUpload('shop', 4, ['image/png', 'image/webp', 'image/gif', 'image/jpeg']);

economyRouter.get('/catalog', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(catalog());
});

economyRouter.get('/me', requireAuth, (req, res) => {
  const id = req.user.id;
  res.json({ wallet: getWallet(id), badges: getBadges(id), inventory: getInventory(id), profile: getProfile(id) });
});

economyRouter.post('/shop/buy', requireAuth, (req, res) => {
  try {
    const wallet = buyItem(req.user.id, String(req.body?.itemId ?? ''));
    res.json({ wallet, inventory: getInventory(req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

economyRouter.get('/items/:id/image', (req, res) => {
  const row = customItemFile(Number(String(req.params.id).replace(/^c-/, '')));
  if (!row) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.type(row.mime).sendFile(path.join(uploadRoot, 'shop', path.basename(row.file_path)));
});

/** Eigene Artikel (ab Moderator) – danach für alle kaufbar; Ersteller:in bekommt 50 % jedes Verkaufs. */
economyRouter.post('/items', requireRank('uploadShopItem'), handleUpload(itemUpload.single('file')), (req, res) => {
  const fail = (msg) => (removeFile(req.file), res.status(400).json({ error: msg }));
  const type = String(req.body.type ?? '');
  const name = String(req.body.name ?? '').trim();
  const price = Number(req.body.price);
  if (!req.file) return fail('Bitte eine Bilddatei auswählen (PNG, WebP, GIF oder JPG).');
  if (!['background', 'frame', 'avatar'].includes(type)) return fail('Typ muss Hintergrund, Rahmen oder Avatar sein.');
  if (name.length < 3 || name.length > 40) return fail('Der Name muss 3–40 Zeichen lang sein.');
  if (!Number.isInteger(price) || price < 10 || price > 5000) return fail('Der Preis muss zwischen 10 und 5000 Coins liegen.');

  const item = addCustomItem({ type, name, price, filePath: req.file.filename, mime: req.file.mimetype, creatorId: req.user.id });
  res.status(201).json({ item });
});

economyRouter.delete('/items/:id', requireRank('moderate'), (req, res) => {
  removeCustomItem(Number(String(req.params.id).replace(/^c-/, '')));
  res.json({ ok: true });
});

// ─── Öffentliches Profil ───────────────────────────────────────────────────

/** Abfragen anderer Module werden erst bei Bedarf vorbereitet (deren Tabellen entstehen beim Import). */
let extraStmts = null;
const extra = () =>
  (extraStmts ??= {
    posts: db.prepare(`
      SELECT p.id, p.title, p.score, p.comment_count, p.created_at, s.name AS sub FROM red_posts p
      JOIN red_subs s ON s.id = p.sub_id WHERE p.user_id = ? AND s.listed = 1 ORDER BY p.created_at DESC LIMIT 5`),
    sudoku: db.prepare('SELECT COUNT(*) AS solved, MIN(seconds) AS best FROM sudoku_daily_results WHERE user_id = ?'),
  });

/** Öffentliche Profilansicht – enthält bewusst keine Coins, keine Buchungen und nichts aus anonymen Uploads. */
function publicProfile(user) {
  const wallet = getWallet(user.id);
  const rank = rankOf(user);
  const profile = getProfile(user.id);
  let recentPosts = [];
  let sudoku = { solved: 0, best: null };
  try {
    recentPosts = extra().posts.all(user.id).map((p) => ({ id: p.id, title: p.title, sub: p.sub, score: p.score, comments: p.comment_count, createdAt: p.created_at }));
    sudoku = extra().sudoku.get(user.id);
  } catch {
    /* Modul nicht geladen */
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      color: user.color,
      avatar: user.avatar ?? null,
      createdAt: user.created_at,
      rank,
      rankLabel: RANKS[rank].label,
      isAdmin: rank === 'admin',
      isModerator: user.role === 'moderator',
      untisLinked: Boolean(untisLinks.findByUser(user.id)),
    },
    level: { level: wallet.level, xp: wallet.xp, levelXp: wallet.levelXp, levelSpan: wallet.levelSpan },
    badges: getBadges(user.id),
    ...profile,
    stats: {
      chatDays: db.prepare("SELECT COUNT(DISTINCT day) AS n FROM ledger WHERE user_id = ? AND action = 'chat.message'").get(user.id).n,
      posts: countAction(user.id, 'red.post'),
      comments: countAction(user.id, 'red.comment'),
      upvotes: countAction(user.id, 'red.upvote_received'),
      uploads: countAction(user.id, 'molly.public_upload'),
      dailySudokus: countAction(user.id, 'sudoku.daily'),
      loginStreak: streakOf(user.id, 'daily.login'),
    },
    recentPosts,
    sudoku: { solved: sudoku?.solved ?? 0, best: sudoku?.best ?? null },
  };
}

profileRouter.get('/:username', (req, res) => {
  const user = users.findByName(String(req.params.username));
  if (!user) return res.status(404).json({ error: 'Dieses Profil existiert nicht.' });
  res.json({ profile: publicProfile(user) });
});

const PROFILE_FIELDS = ['bio', 'status', 'theme', 'infoTitle', 'infoText', 'showcase', 'showcases', 'featuredBadge', 'background', 'frame', 'clippyHat', 'clippyGlasses'];

profileRouter.patch('/me', requireAuth, (req, res) => {
  const patch = Object.fromEntries(PROFILE_FIELDS.filter((k) => req.body?.[k] !== undefined).map((k) => [k, req.body[k]]));
  try {
    updateProfile(req.user.id, patch);
    res.json({ profile: publicProfile(req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
