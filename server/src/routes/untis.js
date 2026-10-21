/**
 * /api/untis – Verknüpfung eines OSSXP-Accounts mit WebUntis + Datenendpunkte für UntisXP.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { untisLinks } from '../db.js';
import { publicUser, requireAuth, requireUntis } from '../middleware/auth.js';
import { encrypt } from '../untis/crypto.js';
import { UntisError } from '../untis/errors.js';
import { parseServerInput, untisService } from '../untis/service.js';

export const untisRouter = Router();
untisRouter.use(requireAuth);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const linkLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Verknüpfungsversuche. Bitte später erneut versuchen.' },
});

/** Untis-Fehler mit passendem Status weiterreichen, alles andere an den globalen Handler. */
function handleUntisError(res, err, next) {
  if (err instanceof UntisError) return res.status(err.httpStatus).json({ error: err.message, kind: err.kind });
  next(err);
}

untisRouter.get('/status', (req, res) => {
  const link = untisLinks.findByUser(req.user.id);
  res.json({
    linked: Boolean(link),
    mode: untisService.mode,
    link: link ? { server: link.server, school: link.school, username: link.username } : null,
  });
});

/**
 * Verknüpfen: Zugangsdaten werden zuerst live bei WebUntis geprüft
 * und erst bei Erfolg verschlüsselt gespeichert.
 */
untisRouter.post('/link', linkLimiter, async (req, res, next) => {
  const parsed = parseServerInput(req.body?.server);
  const server = parsed.server;
  const school = String(req.body?.school || parsed.school || '').trim();
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!server || !school || !username || !password) {
    return res.status(400).json({ error: 'Bitte Server, Schule, Benutzername und Passwort angeben.' });
  }
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(server)) {
    return res.status(400).json({ error: 'Ungültige Serveradresse (Beispiel: nessa.webuntis.com).' });
  }

  try {
    await untisService.verify({ server, school, username, password });
  } catch (err) {
    return handleUntisError(res, err, next);
  }

  untisLinks.upsert({ userId: req.user.id, server, school, username, secretEnc: encrypt(password) });
  untisService.forget(req.user.id);
  res.json({ user: publicUser(req.user) });
});

untisRouter.delete('/link', (req, res) => {
  untisLinks.remove(req.user.id);
  untisService.forget(req.user.id);
  res.json({ user: publicUser(req.user) });
});

// ─── Daten (nur mit Verknüpfung) ───────────────────────────────────────────

untisRouter.get('/timegrid', requireUntis, async (req, res, next) => {
  try {
    res.json({ timegrid: await untisService.getTimegrid(req.untisLink) });
  } catch (err) {
    handleUntisError(res, err, next);
  }
});

untisRouter.get('/timetable', requireUntis, async (req, res, next) => {
  const { from, to } = req.query;
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return res.status(400).json({ error: 'Parameter from/to im Format YYYY-MM-DD erforderlich.' });
  }
  if ((new Date(to) - new Date(from)) / 86_400_000 > 31) {
    return res.status(400).json({ error: 'Maximal 31 Tage pro Anfrage.' });
  }
  try {
    const lessons = await untisService.getTimetable(req.untisLink, from, to);
    res.json({ from, to, lessons, mode: untisService.mode });
  } catch (err) {
    handleUntisError(res, err, next);
  }
});
