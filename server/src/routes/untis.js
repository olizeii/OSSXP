/**
 * /api/untis – Verknüpfung eines OSSXP-Accounts mit WebUntis + alle Datenendpunkte für UntisXP
 * (entspricht den /api/untis/*-Routen von UntisDashboard).
 *
 *   GET    /status                      Verknüpfung, Modus, Zeitzone, aktuelle Schulzeit
 *   POST   /link, DELETE /link          verknüpfen / Verknüpfung aufheben
 *   GET    /timetable?from&to           eigener Stundenplan (Wochenansicht)
 *   GET    /timegrid                    Zeitraster
 *   GET    /master                      Lehrkräfte, Klassen, Räume, Fächer
 *   GET    /element?type&id&date&time   Live-Status + Tagesplan einer Lehrkraft/Klasse/eines Raums
 *   GET    /rooms/free?date&time        freie und belegte Räume
 *   GET    /substitutions?date&range    Vertretungsplan (range = day | week)
 *   GET    /stats?date&time             Dashboard-Kennzahlen
 *   GET    /me                          eigene Klasse
 *   GET    /exams?from&to               anstehende Tests/Schularbeiten
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { untisLinks } from '../db.js';
import { award } from '../economy/service.js';
import { publicUser, requireAuth, requireUntis } from '../middleware/auth.js';
import { encrypt } from '../untis/crypto.js';
import { UntisError } from '../untis/errors.js';
import { parseServerInput, resolveMoment, untisFor, untisService } from '../untis/service.js';
import { addDays, isIsoDate, startOfWeek, zonedNow } from '../untis/time.js';

export const untisRouter = Router();
untisRouter.use(requireAuth);

const ELEMENT_TYPES = new Set(['teacher', 'class', 'room']);

const linkLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Verknüpfungsversuche. Bitte später erneut versuchen.' },
});

/** Führt eine Untis-Abfrage aus; Untis-Fehler gehen mit passendem Status an den Browser. */
const handle = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req, untisFor(req.untisLink)));
  } catch (err) {
    if (err instanceof UntisError) return res.status(err.httpStatus).json({ error: err.message, kind: err.kind });
    next(err);
  }
};

const badRequest = (message) => new UntisError('config', message);

// ─── Verknüpfung ───────────────────────────────────────────────────────────

untisRouter.get('/status', (req, res) => {
  const link = untisLinks.findByUser(req.user.id);
  const now = zonedNow(untisService.timezone);
  res.json({
    linked: Boolean(link),
    mode: untisService.mode,
    timezone: untisService.timezone,
    today: now.date,
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
    if (err instanceof UntisError) return res.status(err.httpStatus).json({ error: err.message, kind: err.kind });
    return next(err);
  }

  untisLinks.upsert({ userId: req.user.id, server, school, username, secretEnc: encrypt(password) });
  untisService.forget(req.user.id);
  award(req.user.id, 'untis.linked', 'link');
  res.json({ user: publicUser(req.user) });
});

untisRouter.delete('/link', (req, res) => {
  untisLinks.remove(req.user.id);
  untisService.forget(req.user.id);
  res.json({ user: publicUser(req.user) });
});

// ─── Daten (nur mit Verknüpfung) ───────────────────────────────────────────

untisRouter.use(requireUntis);

untisRouter.get(
  '/timetable',
  handle(async (req, untis) => {
    const { from, to } = req.query;
    if (!isIsoDate(from) || !isIsoDate(to)) throw badRequest('Parameter from/to im Format YYYY-MM-DD erforderlich.');
    if ((new Date(to) - new Date(from)) / 86_400_000 > 31) throw badRequest('Maximal 31 Tage pro Anfrage.');
    return { from, to, lessons: await untis.ownTimetable(from, to), mode: untisService.mode };
  }),
);

untisRouter.get('/timegrid', handle(async (_req, untis) => ({ timegrid: await untis.timegrid() })));

untisRouter.get(
  '/master',
  handle(async (_req, untis) => ({ ...(await untis.masterData()), mode: untisService.mode, timezone: untisService.timezone })),
);

untisRouter.get(
  '/element',
  handle(async (req, untis) => {
    const type = String(req.query.type);
    const id = Number(req.query.id);
    if (!ELEMENT_TYPES.has(type) || !Number.isInteger(id)) throw badRequest('Parameter type (teacher|class|room) und id erforderlich.');
    return untis.elementStatus(type, id, resolveMoment(req.query.date, req.query.time));
  }),
);

untisRouter.get('/rooms/free', handle(async (req, untis) => untis.freeRooms(resolveMoment(req.query.date, req.query.time))));

untisRouter.get(
  '/substitutions',
  handle(async (req, untis) => {
    const { date } = resolveMoment(req.query.date);
    const week = req.query.range === 'week';
    const from = week ? startOfWeek(date) : date;
    const to = week ? addDays(from, 4) : date;
    return untis.substitutions(from, to);
  }),
);

untisRouter.get('/stats', handle(async (req, untis) => untis.dashboard(resolveMoment(req.query.date, req.query.time))));

/** Eigene Klasse (Schüler-Dashboard, MollyXP) */
untisRouter.get('/me', handle(async (_req, untis) => ({ class: await untis.ownClass() })));

/** Anstehende Tests/Schularbeiten der eigenen Klasse (Standard: heute + 4 Wochen) */
untisRouter.get(
  '/exams',
  handle(async (req, untis) => {
    const { date } = resolveMoment(req.query.from);
    const from = isIsoDate(req.query.from) ? req.query.from : date;
    const to = isIsoDate(req.query.to) ? req.query.to : addDays(from, 28);
    if ((new Date(to) - new Date(from)) / 86_400_000 > 62) throw badRequest('Maximal 62 Tage pro Anfrage.');
    return { from, to, ...(await untis.exams(from, to)) };
  }),
);
