/**
 * Ränge & Berechtigungen (5 Stufen, von oben nach unten):
 *
 *   5 admin      – im Server festgelegt (Rolle in der DB oder ADMIN_USERNAMES)
 *   4 moderator  – vom Admin ernannt (Rolle in der DB)
 *   3 regular    – „Stammgast“: automatisch ab Level STAMMGAST_LEVEL (+ Abzeichen)
 *   2 verified   – „Verifiziert“: Konto mit Untis/Schule verknüpft
 *   1 new        – „Neuer Nutzer“: Basis-Konto (strengere Limits, keine Links)
 *
 * Gespeichert werden nur admin/moderator; die unteren Ränge ergeben sich aus Level und Untis-Link.
 * Jeder höhere Rang hat automatisch alle Rechte der darunterliegenden.
 */
import { config } from './config.js';
import { untisLinks } from './db.js';
import { SHOP_UPLOAD_LEVEL, STAMMGAST_LEVEL } from './economy/catalog.js';
import { getWallet } from './economy/service.js';

export { STAMMGAST_LEVEL };

export const RANKS = {
  admin: { order: 5, label: 'Admin', color: '#c0392b' },
  moderator: { order: 4, label: 'Moderator', color: '#1e8e3e' },
  regular: { order: 3, label: 'Stammgast', color: '#d4a017' },
  verified: { order: 2, label: 'Verifiziert', color: '#2f6fde' },
  new: { order: 1, label: 'Neuer Nutzer', color: '#8a8a8a' },
};

/** Was ab welchem Rang erlaubt ist – eine Stelle für alle Apps. */
export const PERMISSIONS = {
  postLinks: 'verified', // Links in Chat/redXP
  createSubreddit: 'regular', // startet privat, öffentlich ab 10 Mitgliedern
  addEmote: 'verified', // 7TV-Emotes für alle hinzufügen
  createChannel: 'moderator',
  moderate: 'moderator', // löschen, Timeouts, Emotes entfernen
  uploadShopItem: 'regular', // Stammgäste zusätzlich erst ab SHOP_UPLOAD_LEVEL, siehe canUploadShopItem()
  publishNews: 'admin',
  appointModerators: 'admin',
};

export function isAdmin(user) {
  if (!user) return false;
  return user.role === 'admin' || config.adminUsernames.includes(user.username.toLowerCase());
}

export function rankOf(user) {
  if (!user) return null;
  if (isAdmin(user)) return 'admin';
  if (user.role === 'moderator') return 'moderator';
  if (getWallet(user.id).level >= STAMMGAST_LEVEL) return 'regular';
  if (untisLinks.findByUser(user.id)) return 'verified';
  return 'new';
}

export const hasRank = (user, min) => Boolean(user) && RANKS[rankOf(user)].order >= RANKS[min].order;
export const can = (user, permission) => hasRank(user, PERMISSIONS[permission]);

/** Shop-Uploads: Moderation und Admins immer, Stammgäste ab einem hohen Level (mit Freigabe durch die Moderation). */
export const canUploadShopItem = (user) => hasRank(user, 'moderator') || (hasRank(user, 'regular') && getWallet(user.id).level >= SHOP_UPLOAD_LEVEL);

/** Express-Middleware: mindestens Rang `min` (oder eine Berechtigung aus PERMISSIONS). */
export function requireRank(minOrPermission) {
  const min = PERMISSIONS[minOrPermission] ?? minOrPermission;
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sie sind nicht angemeldet.' });
    if (!hasRank(req.user, min)) {
      return res.status(403).json({ error: `Dafür brauchst du mindestens den Rang „${RANKS[min].label}“.` });
    }
    next();
  };
}
