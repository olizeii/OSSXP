/**
 * Start-Daten: legt einen Admin-Account an, falls es noch keinen gibt –
 * damit Moderation, NewsXP-Verwaltung usw. sofort testbar sind.
 *
 *   Benutzername: SEED_ADMIN_USERNAME (Standard „admin“)
 *   Kennwort:     SEED_ADMIN_PASSWORD (Pflicht in Produktion; im Dev-Modus Standard „admin1234“)
 *
 * Bitte nach dem ersten Login das Kennwort ändern bzw. in Produktion ein eigenes setzen.
 */
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { users } from './db.js';
import { onUserCreated } from './economy/service.js';

const DEV_PASSWORD = 'admin1234';

export function seedAdmin() {
  if (users.countRole('admin') > 0) return;

  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || (config.isProd ? null : DEV_PASSWORD);
  if (!password) {
    console.warn('[seed] Kein Admin vorhanden und SEED_ADMIN_PASSWORD nicht gesetzt – überspringe.');
    return;
  }

  const existing = users.findByName(username);
  if (existing) {
    // Einen fremden Account mit diesem Namen NICHT einfach zum Admin machen
    console.warn(`[seed] Benutzername „${username}“ ist bereits vergeben – bitte SEED_ADMIN_USERNAME setzen.`);
    return;
  }

  const user = users.create({ username, passwordHash: bcrypt.hashSync(password, 12), color: '#C0392B' });
  users.setRole(user.id, 'admin');
  onUserCreated(user.id);
  console.log(`[seed] Admin-Account „${username}“ angelegt${process.env.SEED_ADMIN_PASSWORD ? '' : ` (Kennwort: ${DEV_PASSWORD} – nur für die Entwicklung!)`}.`);
}
