/**
 * Profile, Wallet & Shop:
 *   GET   /api/economy/catalog      Abzeichen, Shop-Artikel, Belohnungen (öffentlich)
 *   GET   /api/economy/me           eigenes Wallet, Abzeichen, Inventar, Profil
 *   POST  /api/economy/shop/buy     Artikel kaufen { itemId }
 *   GET   /api/profiles/:username   öffentliches Profil (Steam-ähnlich)
 *   PATCH /api/profiles/me          Bio, Vitrine, Hintergrund, Rahmen
 */
import { Router } from 'express';
import { users } from '../db.js';
import {
  buyItem,
  catalog,
  countAction,
  getBadges,
  getInventory,
  getProfile,
  getWallet,
  updateProfile,
} from '../economy/service.js';
import { isAdmin, requireAuth } from '../middleware/auth.js';
import { untisLinks } from '../db.js';

export const economyRouter = Router();
export const profileRouter = Router();

economyRouter.get('/catalog', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
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

/** Öffentliche Profilansicht – enthält bewusst keine Coins, keine Buchungen und nichts aus anonymen Uploads. */
function publicProfile(user) {
  const wallet = getWallet(user.id);
  return {
    user: {
      id: user.id,
      username: user.username,
      color: user.color,
      avatar: user.avatar ?? null,
      createdAt: user.created_at,
      isAdmin: isAdmin(user),
      untisLinked: Boolean(untisLinks.findByUser(user.id)),
    },
    level: { level: wallet.level, xp: wallet.xp, levelXp: wallet.levelXp, levelSpan: wallet.levelSpan },
    badges: getBadges(user.id),
    ...getProfile(user.id),
    stats: {
      chatMessages: countAction(user.id, 'chat.message'),
      posts: countAction(user.id, 'red.post'),
      comments: countAction(user.id, 'red.comment'),
      upvotes: countAction(user.id, 'red.upvote_received'),
      uploads: countAction(user.id, 'molly.public_upload'),
      dailySudokus: countAction(user.id, 'sudoku.daily'),
    },
  };
}

profileRouter.get('/:username', (req, res) => {
  const user = users.findByName(String(req.params.username));
  if (!user) return res.status(404).json({ error: 'Dieses Profil existiert nicht.' });
  res.json({ profile: publicProfile(user) });
});

profileRouter.patch('/me', requireAuth, (req, res) => {
  const { bio, showcase, background, frame } = req.body ?? {};
  try {
    updateProfile(req.user.id, Object.fromEntries(Object.entries({ bio, showcase, background, frame }).filter(([, v]) => v !== undefined)));
    res.json({ profile: publicProfile(req.user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
