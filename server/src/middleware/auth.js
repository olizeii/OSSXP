/**
 * Authentifizierung per JWT in einem httpOnly-Cookie.
 * Das Token ist für JavaScript im Browser unsichtbar (Schutz gegen XSS-Diebstahl);
 * `sameSite: lax` schützt gegen die meisten CSRF-Angriffe.
 */
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { users, untisLinks } from '../db.js';
import { RANKS, isAdmin, rankOf, requireRank } from '../roles.js';

export { isAdmin };

const { jwtSecret, cookieName, cookieSecure, tokenTtlSeconds } = config.auth;

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), name: user.username }, jwtSecret, {
    expiresIn: tokenTtlSeconds,
  });
}

/** Liefert den User zu einem Token – oder null bei ungültigem/abgelaufenem Token. */
export function userFromToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, jwtSecret);
    return users.findById(Number(payload.sub));
  } catch {
    return null;
  }
}

export function setAuthCookie(res, user) {
  res.cookie(cookieName, signToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure,
    maxAge: tokenTtlSeconds * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(cookieName, { path: '/' });
}

/** Hängt `req.user` an jede Anfrage (oder null für Gäste). */
export function attachUser(req, _res, next) {
  req.user = userFromToken(req.cookies?.[cookieName]);
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sie sind nicht angemeldet.' });
  next();
}

/** Nur für User, deren Account mit Untis verknüpft ist. Hängt `req.untisLink` an. */
export function requireUntis(req, res, next) {
  const link = req.user && untisLinks.findByUser(req.user.id);
  if (!link) return res.status(403).json({ error: 'Ihr Konto ist nicht mit Untis verknüpft.' });
  req.untisLink = link;
  next();
}

/** Nur Admins (Rolle „admin“ oder ADMIN_USERNAMES). */
export const requireAdmin = requireRank('admin');

/** Öffentliche Sicht auf einen User – wird an den Client geschickt (nie password_hash!). */
export function publicUser(user) {
  const link = untisLinks.findByUser(user.id);
  const rank = rankOf(user);
  return {
    id: user.id,
    username: user.username,
    color: user.color,
    rank,
    rankLabel: RANKS[rank].label,
    isAdmin: rank === 'admin',
    isModerator: RANKS[rank].order >= RANKS.moderator.order,
    avatar: user.avatar ?? null,
    createdAt: user.created_at,
    untisLinked: Boolean(link),
    untis: link ? { server: link.server, school: link.school, username: link.username } : null,
  };
}
