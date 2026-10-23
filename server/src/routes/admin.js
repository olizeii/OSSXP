/**
 * Verwaltung (nur Admins):
 *   GET   /api/admin/moderators              alle Moderator:innen
 *   PATCH /api/admin/users/:username/role    { role: 'moderator' | 'user' }  → ernennen / entfernen
 *   POST  /api/admin/users/:username/grant   { coins, xp }  → Coins/XP gutschreiben (auch sich selbst)
 */
import { Router } from 'express';
import { users } from '../db.js';
import { emitToUser } from '../realtime.js';
import { isAdmin, requireRank } from '../roles.js';
import { publicUser } from '../middleware/auth.js';
import { grant } from '../economy/service.js';

const MAX_GRANT = 10_000_000;

export const adminRouter = Router();
adminRouter.use(requireRank('appointModerators'));

adminRouter.get('/moderators', (_req, res) => {
  res.json({ moderators: users.withRole('moderator').map((u) => ({ username: u.username, color: u.color })) });
});

adminRouter.patch('/users/:username/role', (req, res) => {
  const target = users.findByName(String(req.params.username));
  const role = req.body?.role;
  if (!target) return res.status(404).json({ error: 'User nicht gefunden.' });
  if (!['moderator', 'user'].includes(role)) return res.status(400).json({ error: 'Rolle muss „moderator“ oder „user“ sein.' });
  if (isAdmin(target)) return res.status(400).json({ error: 'Admins werden im Server festgelegt.' });

  users.setRole(target.id, role);
  const updated = publicUser(users.findById(target.id));
  // Betroffene:n live informieren (Startmenü, Rechte in allen Apps)
  emitToUser(target.id, 'account:update', { user: updated });
  res.json({ user: updated });
});

adminRouter.post('/users/:username/grant', (req, res) => {
  const target = users.findByName(String(req.params.username));
  if (!target) return res.status(404).json({ error: 'User nicht gefunden.' });
  const coins = Number(req.body?.coins ?? 0);
  const xp = Number(req.body?.xp ?? 0);
  const valid = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_GRANT;
  if (!valid(coins) || !valid(xp) || coins + xp === 0) {
    return res.status(400).json({ error: `Coins und XP: ganze Zahlen von 0 bis ${MAX_GRANT.toLocaleString('de-DE')}.` });
  }
  // Eindeutige Referenz je Gutschrift; book() meldet Level-Aufstiege und Abzeichen live
  const result = grant(target.id, 'admin.grant', `${Date.now()}:${req.user.id}`, coins, xp, `Geschenk von ${req.user.username}`);
  res.json({ wallet: result?.wallet ?? null });
});
