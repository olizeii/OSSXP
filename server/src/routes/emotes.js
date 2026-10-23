/**
 * /api/emotes
 *   GET    /                 zusammengeführte Liste (7TV, BTTV, FFZ, OSSXP-Set) – öffentlich
 *   GET    /search?q=        7TV-Katalog durchsuchen
 *   POST   /custom           { id, name } Emote für alle hinzufügen          (ab „Verifiziert“)
 *   DELETE /custom/:name     Emote aus dem OSSXP-Set entfernen              (Moderator)
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { addCustomEmote, getEmotes, removeCustomEmote, search7tv } from '../emotes/providers.js';
import { requireRank } from '../roles.js';

export const emotesRouter = Router();

const EMOTE_NAME_RE = /^[\w:()!?'.-]{2,32}$/u;
const searchLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

emotesRouter.get('/', async (_req, res) => {
  const { emotes, updatedAt } = await getEmotes();
  res.set('Cache-Control', 'public, max-age=120');
  res.json({ emotes, updatedAt });
});

emotesRouter.get('/search', searchLimiter, async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ results: [] });
  try {
    res.json({ results: await search7tv(q.slice(0, 40)) });
  } catch (err) {
    res.status(502).json({ error: `7TV-Suche nicht erreichbar: ${err.message}` });
  }
});

emotesRouter.post('/custom', requireRank('addEmote'), (req, res) => {
  const id = String(req.body?.id ?? '');
  const name = String(req.body?.name ?? '').trim();
  if (!/^[0-9A-Za-z]{10,40}$/.test(id) || !EMOTE_NAME_RE.test(name)) return res.status(400).json({ error: 'Ungültiges Emote.' });
  try {
    addCustomEmote({ id, name, animated: Boolean(req.body?.animated), userId: req.user.id });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(409).json({ error: err.message });
  }
});

emotesRouter.delete('/custom/:name', requireRank('moderate'), (req, res) => {
  removeCustomEmote(String(req.params.name));
  res.json({ ok: true });
});
