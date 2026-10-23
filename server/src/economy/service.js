/**
 * Globales Profil-, Level- & Economy-System (Steam-ähnlich).
 *
 * Datenmodell (SQLite):
 *   profiles           1:1 zu users – Bio, Status, Design, Vitrinen, Ausrüstung (Hintergrund, Rahmen, Clippy)
 *   wallets            1:1 zu users – Coins und XP (Level wird aus XP berechnet, ohne Obergrenze)
 *   ledger             jede Belohnung/Ausgabe als Buchung; UNIQUE(user, action, ref) verhindert Doppelzahlungen
 *   user_badges        verdiente Abzeichen
 *   inventory          gekaufte Shop-Artikel
 *   shop_custom_items  von Moderator:innen hochgeladene Artikel
 *
 * Apps rufen nur `award(userId, action, ref)` auf. Hier passieren zentral:
 * Cooldown, Stunden-/Tageslimit, abnehmende Belohnung, Glücksbonus, Level-Aufstieg, Abzeichen
 * und der Live-Push an alle Tabs des Users.
 */
import { config } from '../config.js';
import { db } from '../db.js';
import { emitToUser } from '../realtime.js';
import { addDays, zonedNow } from '../untis/time.js';
import {
  BADGES,
  BADGE_IDS,
  CREATOR_SHARE,
  DEFAULT_ITEMS,
  PROFILE_THEMES,
  REWARDS,
  SHOWCASES,
  STAMMGAST_LEVEL,
  STATIC_ITEMS_BY_ID,
  levelInfo,
  levelUpCoins,
  loginStreakBonus,
  xpToNext,
} from './catalog.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    bio        TEXT    NOT NULL DEFAULT '',
    showcase   TEXT    NOT NULL DEFAULT '[]',     -- JSON: bis zu 3 Abzeichen-IDs für die Vitrine
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

  CREATE TABLE IF NOT EXISTS shop_custom_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL CHECK (type IN ('background', 'frame', 'avatar')),
    name        TEXT    NOT NULL,
    price       INTEGER NOT NULL,
    file_path   TEXT    NOT NULL,
    mime        TEXT    NOT NULL,
    creator_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL
  );
`);

// Neue Profil-Spalten für bestehende Datenbanken
const profileColumns = new Set(db.prepare('PRAGMA table_info(profiles)').all().map((c) => c.name));
for (const [col, def] of [
  ['theme', "TEXT NOT NULL DEFAULT 'luna'"],
  ['status', "TEXT NOT NULL DEFAULT ''"],
  ['info_title', "TEXT NOT NULL DEFAULT ''"],
  ['info_text', "TEXT NOT NULL DEFAULT ''"],
  ['showcases', `TEXT NOT NULL DEFAULT '["badges","stats"]'`],
  ['featured_badge', 'TEXT'],
  ['clippy_hat', `TEXT NOT NULL DEFAULT '${DEFAULT_ITEMS.clippyHat}'`],
  ['clippy_glasses', `TEXT NOT NULL DEFAULT '${DEFAULT_ITEMS.clippyGlasses}'`],
]) {
  if (!profileColumns.has(col)) db.exec(`ALTER TABLE profiles ADD COLUMN ${col} ${def}`);
}

const stmt = {
  ensureWallet: db.prepare('INSERT OR IGNORE INTO wallets (user_id) VALUES (?)'),
  wallet: db.prepare('SELECT coins, xp FROM wallets WHERE user_id = ?'),
  addToWallet: db.prepare('UPDATE wallets SET coins = coins + ?, xp = xp + ? WHERE user_id = ?'),
  ledgerExists: db.prepare('SELECT 1 FROM ledger WHERE user_id = ? AND action = ? AND ref = ?'),
  countToday: db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND action = ? AND day = ? AND (coins > 0 OR xp > 0)'),
  countSince: db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND action = ? AND created_at >= ? AND (coins > 0 OR xp > 0)'),
  lastRewarded: db.prepare('SELECT MAX(created_at) AS t FROM ledger WHERE user_id = ? AND action = ? AND (coins > 0 OR xp > 0)'),
  countAction: db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND action = ?'),
  distinctDays: db.prepare('SELECT COUNT(DISTINCT day) AS n FROM ledger WHERE user_id = ? AND action = ?'),
  actionDays: db.prepare('SELECT DISTINCT day FROM ledger WHERE user_id = ? AND action = ? ORDER BY day DESC LIMIT 400'),
  refsOf: db.prepare('SELECT ref FROM ledger WHERE user_id = ? AND action = ?'),
  insertLedger: db.prepare('INSERT INTO ledger (user_id, action, ref, day, coins, xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  badges: db.prepare('SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at'),
  insertBadge: db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, earned_at) VALUES (?, ?, ?)'),
  inventory: db.prepare('SELECT item_id FROM inventory WHERE user_id = ?'),
  insertItem: db.prepare('INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)'),
  ensureProfile: db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)'),
  profile: db.prepare('SELECT * FROM profiles WHERE user_id = ?'),
  updateProfile: db.prepare(`
    UPDATE profiles SET bio = @bio, showcase = @showcase, background = @background, frame = @frame,
      theme = @theme, status = @status, info_title = @infoTitle, info_text = @infoText, showcases = @showcases,
      featured_badge = @featuredBadge, clippy_hat = @clippyHat, clippy_glasses = @clippyGlasses, updated_at = @now
    WHERE user_id = @userId`),
  customItems: db.prepare('SELECT c.*, u.username AS creator FROM shop_custom_items c LEFT JOIN users u ON u.id = c.creator_id WHERE c.active = 1 ORDER BY c.id DESC'),
  customItem: db.prepare('SELECT c.*, u.username AS creator FROM shop_custom_items c LEFT JOIN users u ON u.id = c.creator_id WHERE c.id = ?'),
  insertCustom: db.prepare('INSERT INTO shop_custom_items (type, name, price, file_path, mime, creator_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  deactivateCustom: db.prepare('UPDATE shop_custom_items SET active = 0 WHERE id = ?'),
};

const today = () => zonedNow(config.untis.timezone).date;

// ─── Shop-Artikel (fest + hochgeladen) ─────────────────────────────────────

const toCustomItem = (row) => ({
  id: `c-${row.id}`,
  type: row.type,
  name: row.name,
  price: row.price,
  image: `/api/economy/items/c-${row.id}/image`,
  animated: row.mime === 'image/gif',
  creator: row.creator ?? null,
  custom: true,
});

export function getItem(id) {
  if (STATIC_ITEMS_BY_ID.has(id)) return STATIC_ITEMS_BY_ID.get(id);
  const m = /^c-(\d+)$/.exec(String(id));
  const row = m && stmt.customItem.get(Number(m[1]));
  return row?.active ? { ...toCustomItem(row), creatorId: row.creator_id } : null;
}

export const allItems = () => [...STATIC_ITEMS_BY_ID.values(), ...stmt.customItems.all().map(toCustomItem)];
export const customItemFile = (id) => stmt.customItem.get(id);

export function addCustomItem({ type, name, price, filePath, mime, creatorId }) {
  const id = stmt.insertCustom.run(type, name, price, filePath, mime, creatorId, Date.now()).lastInsertRowid;
  return getItem(`c-${id}`);
}

export const removeCustomItem = (numericId) => stmt.deactivateCustom.run(numericId);

// ─── Wallet & Level ────────────────────────────────────────────────────────

export function getWallet(userId) {
  stmt.ensureWallet.run(userId);
  const { coins, xp } = stmt.wallet.get(userId);
  return { coins, ...levelInfo(xp) };
}

/** Anzahl gezählter Aktionen (auch über den Limits) – z. B. für Abzeichen und Statistiken. */
export const countAction = (userId, action) => stmt.countAction.get(userId, action).n;

/** Aufeinanderfolgende Tage (bis heute) mit dieser Aktion. */
export function streakOf(userId, action) {
  const days = new Set(stmt.actionDays.all(userId, action).map((r) => r.day));
  let streak = 0;
  for (let d = today(); days.has(d); d = addDays(d, -1)) streak++;
  return streak;
}

// ─── Abzeichen ─────────────────────────────────────────────────────────────

export function getBadges(userId) {
  return stmt.badges.all(userId).filter((b) => BADGE_IDS.has(b.badge_id)).map((b) => ({ id: b.badge_id, earnedAt: b.earned_at }));
}

function insertBadge(userId, badgeId) {
  if (!BADGE_IDS.has(badgeId)) return false;
  return stmt.insertBadge.run(userId, badgeId, Date.now()).changes > 0;
}

/** Bedingungen der Abzeichen – fast alle belohnen Regelmäßigkeit oder Qualität statt Masse. */
const BADGE_RULES = [
  ['untis', (u) => countAction(u, 'untis.linked') >= 1],
  ['loyal', (u) => streakOf(u, 'daily.login') >= 7],
  ['loyal-30', (u) => streakOf(u, 'daily.login') >= 30],
  ['chatter', (u) => stmt.distinctDays.get(u, 'chat.message').n >= 7],
  ['first-post', (u) => countAction(u, 'red.post') >= 1],
  [
    'upvoted',
    (u) => {
      const refs = stmt.refsOf.all(u, 'red.upvote_received').map((r) => r.ref);
      return refs.length >= 25 && new Set(refs.map((r) => r.split(':').pop())).size >= 5;
    },
  ],
  ['note-taker', (u) => countAction(u, 'molly.public_upload') >= 1], // nur nicht-anonyme Uploads
  ['librarian', (u) => countAction(u, 'molly.public_upload') >= 10],
  ['sudoku-daily', (u) => countAction(u, 'sudoku.daily') >= 1],
];

function checkBadges(userId, level) {
  const earned = new Set(getBadges(userId).map((b) => b.id));
  const fresh = [];
  for (const [badge, test] of BADGE_RULES) {
    if (!earned.has(badge) && test(userId) && insertBadge(userId, badge)) fresh.push(badge);
  }
  for (const [badge, min] of [['stammgast', STAMMGAST_LEVEL], ['level-20', 20], ['level-50', 50]]) {
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

/** Bucht Coins/XP, prüft Level-Aufstieg und Abzeichen, meldet alles live. (Intern, in einer Transaktion.) */
function book(userId, action, ref, coins, xp, label, extra = {}) {
  const day = today();
  const before = getWallet(userId).level;
  stmt.insertLedger.run(userId, action, String(ref), day, coins, xp, Date.now());
  stmt.addToWallet.run(coins, xp, userId);

  let after = getWallet(userId).level;
  let levelUp = null;
  let bonus = 0;
  // Mehrere Level auf einmal (z. B. große Belohnung) – jedes einzeln vergüten
  for (let l = before + 1; l <= after; l++) {
    bonus += levelUpCoins(l);
    levelUp = l;
  }
  if (bonus) {
    stmt.insertLedger.run(userId, 'level.up', `level:${after}`, day, bonus, 0, Date.now());
    stmt.addToWallet.run(bonus, 0, userId);
    after = getWallet(userId).level;
  }

  const badges = checkBadges(userId, after);
  const wallet = getWallet(userId);
  const result = { coins, xp, levelUp, badges, wallet, label, ...extra };
  if (coins || xp || levelUp || badges.length) emitToUser(userId, 'economy:update', { ...result, action });
  return result;
}

/**
 * Belohnt eine Aktion nach den Regeln in REWARDS. `ref` macht die Buchung eindeutig.
 * Aktionen ohne Regel werden nur gezählt (0 Coins/XP).
 *
 * @param {{ bonusCoins?: number }} [options]
 * @returns Ergebnis oder null, wenn diese Aktion mit dieser ref schon gebucht ist
 */
export const award = db.transaction((userId, action, ref, options = {}) => {
  stmt.ensureWallet.run(userId);
  if (stmt.ledgerExists.get(userId, action, String(ref))) return null;

  const rule = REWARDS[action];
  const now = Date.now();
  let reason = null;
  if (!rule) reason = 'count-only';
  else if (rule.cooldownSec && now - (stmt.lastRewarded.get(userId, action).t ?? 0) < rule.cooldownSec * 1000) reason = 'cooldown';
  else if (rule.hourlyCap && stmt.countSince.get(userId, action, now - 3_600_000).n >= rule.hourlyCap) reason = 'hourly-cap';
  else if (rule.dailyCap && stmt.countToday.get(userId, action, today()).n >= rule.dailyCap) reason = 'daily-cap';

  if (reason) {
    stmt.insertLedger.run(userId, action, String(ref), today(), 0, 0, now);
    return { coins: 0, xp: 0, levelUp: null, badges: [], wallet: getWallet(userId), limited: reason };
  }

  // Abnehmende Belohnung: 100 %, 75 %, 50 %, ab dann 25 % – Masse lohnt sich nicht
  const nth = rule.decay ? stmt.countToday.get(userId, action, today()).n : 0;
  const factor = Math.max(0.25, 1 - nth * 0.25);
  const lucky = Boolean(rule.lucky) && Math.random() < rule.lucky;
  const coins = Math.round(rule.coins * factor) * (lucky ? 2 : 1) + (options.bonusCoins ?? 0);
  const xp = Math.max(1, Math.round(rule.xp * factor));
  return book(userId, action, ref, coins, xp, rule.label, lucky ? { lucky: true } : {});
});

/** Freie Gutschrift ohne Regeln (z. B. Anteil am Verkauf eigener Shop-Artikel). */
export const grant = db.transaction((userId, action, ref, coins, xp, label) => {
  stmt.ensureWallet.run(userId);
  if (stmt.ledgerExists.get(userId, action, String(ref))) return null;
  return book(userId, action, ref, coins, xp, label);
});

/** Tägliches Einloggen inkl. Serien-Bonus. */
export function awardDailyLogin(userId) {
  const streak = streakOf(userId, 'daily.login') + 1; // heute zählt mit
  return award(userId, 'daily.login', today(), { bonusCoins: loginStreakBonus(streak) });
}

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

// ─── Inventar & Kauf ───────────────────────────────────────────────────────

/** Gekaufte Artikel + alle kostenlosen. */
export function getInventory(userId) {
  const owned = new Set(stmt.inventory.all(userId).map((r) => r.item_id));
  for (const item of STATIC_ITEMS_BY_ID.values()) if (item.price === 0) owned.add(item.id);
  return [...owned];
}

export const ownsItem = (userId, itemId) => getInventory(userId).includes(itemId);

export const buyItem = db.transaction((userId, itemId) => {
  const item = getItem(itemId);
  if (!item) throw new Error('Unbekannter Artikel.');
  if (ownsItem(userId, itemId)) throw new Error('Diesen Artikel besitzen Sie bereits.');
  const wallet = item.price > 0 ? spend(userId, item.price, 'shop.buy', itemId) : getWallet(userId);
  stmt.insertItem.run(userId, itemId, Date.now());

  // Eigene Artikel: Ersteller:in bekommt einen Anteil + Abzeichen „Künstler“
  if (item.custom && item.creatorId && item.creatorId !== userId) {
    const share = Math.floor(item.price * CREATOR_SHARE);
    if (share > 0) grant(item.creatorId, 'shop.sale', `${itemId}:${userId}`, share, 0, `„${item.name}“ wurde gekauft`);
    grantBadge(item.creatorId, 'creator');
  }
  return wallet;
});

// ─── Profil ────────────────────────────────────────────────────────────────

const parseList = (json, allowed) => {
  try {
    return JSON.parse(json).filter((id) => allowed.has(id));
  } catch {
    return [];
  }
};

export function getProfile(userId) {
  stmt.ensureProfile.run(userId);
  const row = stmt.profile.get(userId);
  return {
    bio: row.bio,
    status: row.status,
    theme: row.theme,
    infoTitle: row.info_title,
    infoText: row.info_text,
    showcase: parseList(row.showcase, BADGE_IDS),
    showcases: parseList(row.showcases, new Set(SHOWCASES)),
    featuredBadge: row.featured_badge,
    background: row.background,
    frame: row.frame,
    clippyHat: row.clippy_hat,
    clippyGlasses: row.clippy_glasses,
  };
}

export function updateProfile(userId, patch) {
  const next = { ...getProfile(userId), ...patch };
  const owned = new Set(getInventory(userId));
  const earned = new Set(getBadges(userId).map((b) => b.id));
  const fail = (msg) => {
    throw new Error(msg);
  };

  if (typeof next.bio !== 'string' || next.bio.length > 500) fail('Die Beschreibung darf höchstens 500 Zeichen haben.');
  if (typeof next.status !== 'string' || next.status.length > 80) fail('Der Status darf höchstens 80 Zeichen haben.');
  if (typeof next.infoTitle !== 'string' || next.infoTitle.length > 60) fail('Der Titel der Info-Box ist zu lang.');
  if (typeof next.infoText !== 'string' || next.infoText.length > 1000) fail('Der Text der Info-Box ist zu lang.');
  if (!PROFILE_THEMES.includes(next.theme)) fail('Unbekanntes Design.');
  if (!Array.isArray(next.showcase) || next.showcase.length > 3 || next.showcase.some((id) => !earned.has(id))) {
    fail('In der Vitrine können bis zu 3 eigene Abzeichen liegen.');
  }
  if (!Array.isArray(next.showcases) || next.showcases.some((s) => !SHOWCASES.includes(s))) fail('Unbekannte Vitrine.');
  if (next.featuredBadge && !earned.has(next.featuredBadge)) fail('Hervorgehobene Abzeichen müssen verdient sein.');
  for (const [key, type] of [['background', 'background'], ['frame', 'frame'], ['clippyHat', 'clippy-hat'], ['clippyGlasses', 'clippy-glasses']]) {
    const item = getItem(next[key]);
    if (!item || item.type !== type || !owned.has(item.id)) fail('Dieser Artikel gehört Ihnen nicht.');
  }

  stmt.updateProfile.run({
    userId,
    bio: next.bio.trim(),
    status: next.status.trim(),
    infoTitle: next.infoTitle.trim(),
    infoText: next.infoText.trim(),
    theme: next.theme,
    showcase: JSON.stringify([...new Set(next.showcase)]),
    showcases: JSON.stringify([...new Set(next.showcases)]),
    featuredBadge: next.featuredBadge || null,
    background: next.background,
    frame: next.frame,
    clippyHat: next.clippyHat,
    clippyGlasses: next.clippyGlasses,
    now: Date.now(),
  });
  return getProfile(userId);
}

/** Bis zu 2 Abzeichen pro User für die Anzeige neben dem Namen (hervorgehoben/Vitrine zuerst). */
export function displayBadges(userId) {
  const p = getProfile(userId);
  const picks = [p.featuredBadge, ...p.showcase].filter(Boolean);
  if (picks.length) return [...new Set(picks)].slice(0, 2);
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

/** Öffentlicher Katalog für den Client (inkl. Level-Kurve, damit Fortschritt angezeigt werden kann). */
export const catalog = () => ({
  badges: BADGES,
  items: allItems(),
  rewards: REWARDS,
  themes: PROFILE_THEMES,
  showcases: SHOWCASES,
  levels: Array.from({ length: 30 }, (_, i) => ({ level: i + 1, toNext: xpToNext(i + 1) })),
  stammgastLevel: STAMMGAST_LEVEL,
});
