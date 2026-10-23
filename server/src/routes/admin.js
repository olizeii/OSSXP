/**
 * Verwaltung (nur Admins):
 *   GET   /api/admin/moderators              alle Moderator:innen
 *   PATCH /api/admin/users/:username/role    { role: 'moderator' | 'user' }  → ernennen / entfernen
 */
import { Router } from 'express';
import { users } from '../db.js';
import { emitToUser } from '../realtime.js';
import { isAdmin, requireRank } from '../roles.js';
import { publicUser } from '../middleware/auth.js';

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
