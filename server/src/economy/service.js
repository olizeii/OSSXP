/**
 * Globales Profil-, Level- & Economy-System (Steam-ähnlich).
 *
 * Datenmodell (SQLite):
 *   profiles     1:1 zu users – Bio, Vitrine (showcase), ausgerüsteter Hintergrund/Rahmen
 *   wallets      1:1 zu users – Coins und XP (Level wird aus XP berechnet)
 *   ledger       jede Belohnung/Ausgabe als Buchung; UNIQUE(user, action, ref) verhindert Doppelzahlungen
 *   user_badges  verdiente Abzeichen
 *   inventory    gekaufte Shop-Artikel
 *
 * Apps rufen nur `award(userId, action, ref)` auf – der Rest (Tageslimit, Level-Aufstieg,
 * Abzeichen, Live-Push an alle Tabs des Users) passiert hier zentral.
 */
import { config } from '../config.js';
import { db } from '../db.js';
import { emitToUser } from '../realtime.js';
import { zonedNow } from '../untis/time.js';
import { BADGES, BADGE_IDS, DEFAULT_ITEMS, ITEMS_BY_ID, LEVEL_UP_COINS, REWARDS, levelInfo } from './catalog.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio        TEXT    NOT NULL DEFAULT '',
    showcase   TEXT    NOT NULL DEFAULT '[]',     -- JSON: bis zu 3 Abzeichen-IDs
    background TEXT    NOT NULL DEFAULT '${DEFAULT_ITEMS.background}',
    frame      TEXT    NOT NULL DEFAULT '${DEFAULT_ITEMS.frame}',
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    coins   INTEGER NOT NULL DEFAULT 0,
    xp      INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ledger (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     TEXT    NOT NULL,
    ref        TEXT    NOT NULL,
    day        TEXT    NOT NULL,
    coins      INTEGER NOT NULL,
    xp         INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (user_id, action, ref)
  );
  CREATE INDEX IF NOT EXISTS idx_ledger_user_action_day ON ledger(user_id, action, day);

  CREATE TABLE IF NOT EXISTS user_badges (
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id  TEXT    NOT NULL,
    earned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS inventory (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     TEXT    NOT NULL,
    acquired_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, item_id)
  );
`);

const stmt = {
  ensureWallet: db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)'),
  wallet: db.prepare('SELECT coins, xp FROM wallets WHERE user_id = ?'),
  addToWallet: db.prepare('UPDATE wallets SET coins = coins + ?, xp = xp + ? WHERE user_id = ?'),
  ledgerExists: db.prepare('SELECT 1 FROM ledger WHERE user_id = ? AND action = ? AND ref = ?'),
  countToday: db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND action = ? AND day = ?'),
  countAction: db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND action = ?'),
  insertLedger: db.prepare(
    'INSERT INTO ledger (user_id, action, ref, day, coins, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ),
  badges: db.prepare('SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at'),
  insertBadge: db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)'),
  inventory: db.prepare('SELECT item_id FROM inventory WHERE user_id = ?'),
  insertItem: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)'),
  ensureProfile: db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)'),
  profile: db.prepare('SELECT * FROM profiles WHERE user_id = ?'),
  updateProfile: db.prepare(
    'UPDATE profiles SET bio = @bio, showcase = @showcase, background = @background, frame = @frame, updated_at = @now WHERE user_id = @userId',
  ),
};

const today = () => zonedNow(config.untis.timezone).date;

// ─── Wallet & Level ────────────────────────────────────────────────────────

export function getWallet(userId) {
  stmt.ensureWallet.run(userId);
  const { coins, xp } = stmt.wallet.get(userId);
  return { coins, ...levelInfo(xp) };
}

/** Anzahl gezählter Aktionen (auch über dem Tageslimit) – z. B. für Abzeichen und Statistiken. */
export const countAction = (userId, action) => stmt.countAction.get(userId, action).n;

// ─── Abzeichen ─────────────────────────────────────────────────────────────

export function getBadges(userId) {
  return stmt.badges.all(userId).filter((b) => BADGE_IDS.has(b.badge_id)).map((b) => ({ id: b.badge_id, earnedAt: b.earned_at }));
}

/** Vergibt ein Abzeichen (falls noch nicht vorhanden). Gibt true zurück, wenn es neu ist. */
function insertBadge(userId, badgeId) {
  if (!BADGE_IDS.has(badgeId)) return false;
  return stmt.insertBadge.run(userId, badgeId, Date.now()).changes > 0;
}

/** Abzeichen, deren Bedingung sich aus den Buchungen ergibt. */
const LEDGER_BADGES = [
  ['untis', 'untis.linked', 1],
  ['chatter', 'chat.message', 100],
  ['first-post', 'red.post', 1],
  ['upvoted', 'red.upvote_received', 50],
  ['note-taker', 'molly.public_upload', 1], // nur nicht-anonyme Uploads – Anonymität bleibt gewahrt
  ['librarian', 'molly.public_upload', 10],
  ['sudoku-daily', 'sudoku.daily', 1],
];

function checkBadges(userId, level) {
  const earned = new Set(getBadges(userId).map((b) => b.id));
  const fresh = [];
  for (const [badge, action, min] of LEDGER_BADGES) {
    if (!earned.has(badge) && countAction(userId, action) >= min && insertBadge(userId, badge)) fresh.push(badge);
  }
  for (const [badge, min] of [['level-5', 5], ['level-10', 10]]) {
    if (!earned.has(badge) && level >= min && insertBadge(userId, badge)) fresh.push(badge);
  }
  return fresh;
}

/** Abzeichen von außen vergeben (z. B. „Schnellster Löser“ aus dem Sudoku-Modul). */
export function grantBadge(userId, badgeId) {
  if (!insertBadge(userId, badgeId)) return false;
  emitToUser(userId, 'economy:update', { wallet: getWallet(userId), badges: [badgeId] });
  return true;
}

// ─── Belohnen & Ausgeben ───────────────────────────────────────────────────

/**
 * Belohnt eine Aktion. `ref` macht die Buchung eindeutig (gleiche Aktion + ref = nur einmal).
 * Aktionen ohne Eintrag in REWARDS werden nur gezählt (0 Coins/XP).
 *
 * @returns {{ coins, xp, levelUp: number|null, badges: string[], wallet } | null}  null = schon gebucht
 */
export const award = db.transaction((userId, action, ref) => {
  const rule = REWARDS[action];
  const day = today();
  stmt.ensureWallet.run(userId);
  if (stmt.ledgerExists.get(userId, action, String(ref))) return null;

  const capped = rule ? stmt.countToday.get(userId, action, day).n >= rule.dailyCap : true;
  const coins = capped ? 0 : rule.coins;
  const xp = capped ? 0 : rule.xp;
  const before = levelInfo(stmt.wallet.get(userId).xp).level;

  stmt.insertLedger.run(userId, action, String(ref), day, coins, xp, Date.now());
  stmt.addToWallet.run(coins, xp, userId);

  let after = levelInfo(stmt.wallet.get(userId).xp).level;
  let levelUp = null;
  if (after > before) {
    levelUp = after;
    const bonus = (after - before) * LEVEL_UP_COINS;
    stmt.insertLedger.run(userId, 'level.up', `level:${after}`, day, bonus, 0, Date.now());
    stmt.addToWallet.run(bonus, 0, userId);
  }
  after = Math.max(after, before);

  const badges = checkBadges(userId, after);
  const wallet = getWallet(userId);
  const result = { coins, xp, levelUp, badges, wallet, label: rule?.label };

  // Nur melden, wenn sich sichtbar etwas geändert hat
  if (coins || xp || levelUp || badges.length) emitToUser(userId, 'economy:update', { ...result, action });
  return result;
});

/** Zieht Coins ab (z. B. Shop). Wirft einen Fehler bei zu wenig Guthaben. */
export const spend = db.transaction((userId, coins, action, ref) => {
  const wallet = getWallet(userId);
  if (wallet.coins < coins) throw new Error('Nicht genügend Coins.');
  stmt.insertLedger.run(userId, action, String(ref), today(), -coins, 0, Date.now());
  stmt.addToWallet.run(-coins, 0, userId);
  const updated = getWallet(userId);
  emitToUser(userId, 'economy:update', { wallet: updated, coins: -coins });
  return updated;
});

// ─── Inventar & Profil ─────────────────────────────────────────────────────

/** Gekaufte Artikel + alle kostenlosen. */
export function getInventory(userId) {
  const owned = new Set(stmt.inventory.all(userId).map((r) => r.item_id));
  for (const item of ITEMS_BY_ID.values()) if (item.price === 0) owned.add(item.id);
  return [...owned];
}

export const buyItem = db.transaction((userId, itemId) => {
  const item = ITEMS_BY_ID.get(itemId);
  if (!item) throw new Error('Unbekannter Artikel.');
  if (getInventory(userId).includes(itemId)) throw new Error('Diesen Artikel besitzen Sie bereits.');
  const wallet = spend(userId, item.price, 'shop.buy', itemId);
  stmt.insertItem.run(userId, itemId, Date.now());
  return wallet;
});

export function getProfile(userId) {
  stmt.ensureProfile.run(userId);
  const row = stmt.profile.get(userId);
  let showcase = [];
  try {
    showcase = JSON.parse(row.showcase).filter((id) => BADGE_IDS.has(id));
  } catch {
    /* kaputtes JSON ignorieren */
  }
  return { bio: row.bio, showcase, background: row.background, frame: row.frame };
}

export function updateProfile(userId, patch) {
  const current = getProfile(userId);
  const next = { ...current, ...patch };
  const owned = new Set(getInventory(userId));
  const earned = new Set(getBadges(userId).map((b) => b.id));

  if (typeof next.bio !== 'string' || next.bio.length > 500) throw new Error('Die Beschreibung darf höchstens 500 Zeichen haben.');
  if (!Array.isArray(next.showcase) || next.showcase.length > 3 || next.showcase.some((id) => !earned.has(id))) {
    throw new Error('In der Vitrine können bis zu 3 eigene Abzeichen liegen.');
  }
  for (const [key, type] of [['background', 'background'], ['frame', 'frame']]) {
    const item = ITEMS_BY_ID.get(next[key]);
    if (!item || item.type !== type || !owned.has(item.id)) throw new Error('Dieser Artikel gehört Ihnen nicht.');
  }

  stmt.updateProfile.run({
    userId,
    bio: next.bio.trim(),
    showcase: JSON.stringify([...new Set(next.showcase)]),
    background: next.background,
    frame: next.frame,
    now: Date.now(),
  });
  return getProfile(userId);
}

/** Bis zu 2 Abzeichen pro User für die Anzeige im Chat (Vitrine zuerst, sonst die neuesten). */
export function displayBadges(userId) {
  const showcase = getProfile(userId).showcase;
  if (showcase.length) return showcase.slice(0, 2);
  return getBadges(userId)
    .filter((b) => b.id !== 'welcome')
    .slice(-2)
    .reverse()
    .map((b) => b.id);
}

/** Startausstattung für neue Konten. */
export function onUserCreated(userId) {
  getWallet(userId);
  getProfile(userId);
  insertBadge(userId, 'welcome');
}

export const catalog = () => ({ badges: BADGES, items: [...ITEMS_BY_ID.values()], rewards: REWARDS });
