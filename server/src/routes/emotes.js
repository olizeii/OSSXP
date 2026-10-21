/**
 * /api/emotes – liefert die zusammengeführte 7TV-/BTTV-Emote-Liste (öffentlich, gecached).
 */
import { Router } from 'express';
import { getEmotes } from '../emotes/providers.js';

export const emotesRouter = Router();

emotesRouter.get('/', async (_req, res) => {
  const { emotes, updatedAt } = await getEmotes();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ emotes, updatedAt });
});
