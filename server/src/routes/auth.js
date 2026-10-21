/**
 * /api/auth – Registrierung, Login, Logout, eigenes Profil.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { users } from '../db.js';
import { clearAuthCookie, publicUser, requireAuth, setAuthCookie } from '../middleware/auth.js';

export const authRouter = Router();

/** Chatterino-ähnliche Namensfarben, die neuen Usern zufällig zugewiesen werden. */
export const CHAT_COLORS = [
  '#FF0000', '#0000FF', '#00FF00', '#B22222', '#FF7F50', '#9ACD32', '#FF4500', '#2E8B57',
  '#DAA520', '#D2691E', '#5F9EA0', '#1E90FF', '#FF69B4', '#8A2BE2', '#00FF7F',
];

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const DUMMY_HASH = bcrypt.hashSync('ossxp-timing-dummy', 12);

/** Benutzerbild: mitgeliefertes Bild ("preset:<id>") oder kleines hochgeladenes Bild als data:-URL. */
const PRESET_RE = /^preset:[a-z0-9-]{1,32}$/;
const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_AVATAR_LENGTH = 64 * 1024 * 1.37; // ~64 KB Binärdaten als Base64
const isValidAvatar = (v) =>
  typeof v === 'string' && (PRESET_RE.test(v) || (v.length <= MAX_AVATAR_LENGTH && DATA_URL_RE.test(v)));

// Brute-Force-Schutz: max. 20 Login/Registrierungs-Versuche pro 15 Minuten und IP
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche. Bitte warten Sie einige Minuten.' },
});

function validateCredentials(body) {
  const username = String(body?.username ?? '').trim();
  const password = String(body?.password ?? '');
  if (!USERNAME_RE.test(username)) {
    return { error: 'Der Benutzername muss 3–20 Zeichen lang sein (Buchstaben, Ziffern, _).' };
  }
  if (password.length < 6 || password.length > 128) {
    return { error: 'Das Kennwort muss mindestens 6 Zeichen lang sein.' };
  }
  return { username, password };
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const { username, password, error } = validateCredentials(req.body);
  if (error) return res.status(400).json({ error });
  if (users.findByName(username)) {
    return res.status(409).json({ error: 'Dieser Benutzername ist bereits vergeben.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
  const user = users.create({ username, passwordHash, color });

  setAuthCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const user = users.findByName(username);

  // Immer bcrypt.compare ausführen, damit die Antwortzeit nichts über existierende Namen verrät
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    return res.status(401).json({ error: 'Benutzername oder Kennwort ist falsch.' });
  }

  setAuthCookie(res, user);
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/** Aktueller User – `user: null` für Gäste (kein Fehler, damit der Client einfach starten kann). */
authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

/** Profil ändern: Chat-Farbe und/oder Benutzerbild. */
authRouter.patch('/me', requireAuth, (req, res) => {
  const { color, avatar } = req.body ?? {};
  if (color !== undefined) {
    if (!HEX_COLOR_RE.test(color)) return res.status(400).json({ error: 'Ungültige Farbe.' });
    users.setColor(req.user.id, color.toUpperCase());
  }
  if (avatar !== undefined) {
    if (avatar !== null && !isValidAvatar(avatar)) {
      return res.status(400).json({ error: 'Ungültiges Bild (PNG, JPEG oder WebP, max. 64 KB).' });
    }
    users.setAvatar(req.user.id, avatar);
  }
  res.json({ user: publicUser(users.findById(req.user.id)) });
});
