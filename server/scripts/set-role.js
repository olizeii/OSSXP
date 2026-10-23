/**
 * Rolle eines Kontos direkt in der Datenbank setzen – z. B. das eigene Konto zum Admin machen.
 *
 *   npm run set-role -- <benutzername> <admin|moderator|user>
 *
 * Läuft auf derselben Datenbank wie der Server (DB_FILE aus server/.env). Der Server muss dafür nicht
 * gestoppt werden; eingeloggte Nutzer:innen sehen die neue Rolle nach dem nächsten Neuladen.
 */
import { users } from '../src/db.js';

const ROLES = ['admin', 'moderator', 'user'];
const [username, role] = process.argv.slice(2);

if (!username || !ROLES.includes(role)) {
  console.error('Aufruf: npm run set-role -- <benutzername> <admin|moderator|user>');
  process.exit(1);
}

const user = users.findByName(username);
if (!user) {
  console.error(`Kein Konto „${username}“ gefunden.`);
  process.exit(1);
}

users.setRole(user.id, role);
console.log(`„${user.username}“ ist jetzt ${role}.`);
