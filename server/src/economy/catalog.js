/**
 * Kataloge des OSSXP-Ökosystems – die einzige Quelle für Belohnungen, Level-Kurve, Abzeichen und
 * Shop-Artikel. Der Client lädt sie über GET /api/economy/catalog, damit nichts doppelt gepflegt wird.
 *
 * Neue Belohnung/neues Abzeichen/neuer Artikel = hier einen Eintrag hinzufügen.
 */

/**
 * Belohnungen pro Aktion – bewusst so gebaut, dass sich Spam nicht lohnt:
 *   xp/coins     Grundbelohnung
 *   cooldownSec  Mindestabstand zwischen zwei belohnten Aktionen dieser Art
 *   hourlyCap    max. belohnte Aktionen pro Stunde
 *   dailyCap     max. belohnte Aktionen pro Tag
 *   decay        jede weitere belohnte Aktion am selben Tag bringt 25 % weniger (min. 25 %)
 *   lucky        Chance (0–1) auf doppelte Coins – macht Qualitäts-Aktionen spannender
 * Über den Limits wird die Aktion nur gezählt (0 Coins/XP), damit Statistiken stimmen.
 */
export const REWARDS = {
  'daily.login': { xp: 10, coins: 5, dailyCap: 1, label: 'Täglicher Besuch' },
  'chat.message': { xp: 2, coins: 0, cooldownSec: 60, hourlyCap: 8, dailyCap: 25, label: 'Aktiv im Chat' },
  'red.post': { xp: 15, coins: 5, cooldownSec: 300, dailyCap: 3, decay: true, lucky: 0.1, label: 'Beitrag in redXP' },
  'red.comment': { xp: 4, coins: 1, cooldownSec: 45, hourlyCap: 6, dailyCap: 15, decay: true, label: 'Kommentar in redXP' },
  'red.upvote_received': { xp: 3, coins: 2, dailyCap: 40, label: 'Upvote erhalten' },
  'molly.upload': { xp: 40, coins: 20, cooldownSec: 120, dailyCap: 3, decay: true, lucky: 0.15, label: 'Upload in MollyXP' },
  'molly.views_milestone': { xp: 15, coins: 10, dailyCap: 10, label: 'Dein Upload hilft anderen' },
  'sudoku.daily': { xp: 40, coins: 25, dailyCap: 1, label: 'Tägliches Sudoku gelöst' },
  'sudoku.podium': { xp: 20, coins: 20, dailyCap: 1, label: 'Top 3 im täglichen Sudoku' },
  'news.comment': { xp: 2, coins: 0, cooldownSec: 120, dailyCap: 5, label: 'News kommentiert' },
  'untis.linked': { xp: 50, coins: 50, dailyCap: 1, label: 'Untis verknüpft' },
};

/** Ab diesem Level wird man automatisch „Stammgast“ (Rang + Abzeichen) */
export const STAMMGAST_LEVEL = 8;

/** Login-Serie: +2 Coins pro Tag in Folge, höchstens +20. */
export const loginStreakBonus = (streak) => Math.min(20, Math.max(0, streak - 1) * 2);

// ─── Level-Kurve (ohne Obergrenze, exponentiell steigend) ──────────────────

/** XP, die man von Level `level` auf `level + 1` braucht: 100, 115, 132 … (×1,15 pro Level) */
export const xpToNext = (level) => Math.round(100 * Math.pow(1.15, level - 1));

/** Bonus-Coins beim Erreichen eines Levels – höhere Level sind mehr wert. */
export const levelUpCoins = (level) => 10 + level * 2;

export function levelInfo(xp) {
  let level = 1;
  let base = 0;
  while (xp >= base + xpToNext(level)) {
    base += xpToNext(level);
    level++;
  }
  return { level, xp, levelXp: xp - base, levelSpan: xpToNext(level) };
}

// ─── Abzeichen ─────────────────────────────────────────────────────────────

/**
 * `icon` wird im Client auf einer XP-Medaille dargestellt, `color` ist die Medaillenfarbe.
 * Vergeben werden sie in economy/service.js (checkBadges) oder per grantBadge() aus den Modulen.
 * Wichtig: Abzeichen belohnen Aktivität über Zeit oder Qualität – nicht Masse an einem Tag.
 */
export const BADGES = [
  { id: 'welcome', name: 'Willkommen', description: 'Ein OSSXP-Konto erstellt.', icon: '★', color: '#3a7bd5' },
  { id: 'untis', name: 'Verknüpft', description: 'Konto mit Untis verknüpft.', icon: 'U', color: '#e8601c' },
  { id: 'loyal', name: 'Treuer Besucher', description: '7 Tage in Folge vorbeigeschaut.', icon: '7', color: '#16a085' },
  { id: 'loyal-30', name: 'Unzertrennlich', description: '30 Tage in Folge vorbeigeschaut.', icon: '30', color: '#0e6655' },
  { id: 'chatter', name: 'Gesprächig', description: 'An 7 verschiedenen Tagen im chatterinoXP geschrieben.', icon: '✎', color: '#8a2be2' },
  { id: 'first-post', name: 'Erster Beitrag', description: 'Den ersten Beitrag in redXP verfasst.', icon: '¶', color: '#ff5a1f' },
  { id: 'upvoted', name: 'Beliebt', description: '25 Upvotes von mindestens 5 verschiedenen Personen erhalten.', icon: '▲', color: '#ff8a00' },
  { id: 'note-taker', name: 'Mitschreiber', description: 'Die erste Mitschrift oder den ersten Test öffentlich geteilt.', icon: '✐', color: '#2e8b57' },
  { id: 'librarian', name: 'Bibliothekar', description: '10 öffentliche Uploads in MollyXP.', icon: '❖', color: '#1f6f43' },
  { id: 'helpful', name: 'Hilfreich', description: 'Ein Upload wurde 50-mal angesehen.', icon: '♥', color: '#c2185b' },
  { id: 'sudoku-daily', name: 'Tagesrätsel', description: 'Das erste tägliche Sudoku gelöst.', icon: '9', color: '#1d5fe0' },
  { id: 'sudoku-streak-3', name: 'Sudoku Streak', description: '3 Tage in Folge das tägliche Sudoku gelöst.', icon: '3', color: '#d9730d' },
  { id: 'sudoku-streak-7', name: 'Sudoku-Marathon', description: '7 Tage in Folge das tägliche Sudoku gelöst.', icon: '7', color: '#c0392b' },
  { id: 'sudoku-fastest', name: 'Schnellster Löser', description: 'Platz 1 im täglichen Sudoku.', icon: '⚡', color: '#d4a017' },
  { id: 'stammgast', name: 'Stammgast', description: 'Level 8 erreicht – Rang „Stammgast“ freigeschaltet.', icon: '♛', color: '#b8860b' },
  { id: 'level-20', name: 'Veteran', description: 'Level 20 erreicht.', icon: 'XX', color: '#4b0082' },
  { id: 'level-50', name: 'Legende', description: 'Level 50 erreicht.', icon: 'L', color: '#111111' },
  { id: 'creator', name: 'Künstler', description: 'Ein eigener Shop-Artikel wurde gekauft.', icon: '✦', color: '#e91e63' },
];

export const BADGE_IDS = new Set(BADGES.map((b) => b.id));

// ─── Shop-Artikel ──────────────────────────────────────────────────────────

/**
 * Typen:
 *   background   Profil-Hintergrund  (style = CSS, className = animierte CSS-Klasse im Client)
 *   frame        Rahmen ums Profilbild (style / className)
 *   avatar       Profilbild – die Grafik liegt im Client (client/src/core/cosmetics.ts, Schlüssel = id)
 *   clippy-hat   Hut für Clippy        (Grafik im Client: components/clippy/ClippyCosmetics.tsx)
 *   clippy-glasses Brille für Clippy
 * Von Moderator:innen hochgeladene Artikel kommen zusätzlich aus der Datenbank (shop_custom_items).
 */
export const SHOP_ITEMS = [
  // Profil-Hintergründe
  { id: 'bg-luna', type: 'background', name: 'Luna Blau', price: 0, style: { background: 'linear-gradient(160deg,#0a3ab5 0%,#2f7ff0 55%,#7fb6ff 100%)' } },
  { id: 'bg-bliss', type: 'background', name: 'Pixel-Hügel', price: 80, asset: 'wallpaper' },
  { id: 'bg-olive', type: 'background', name: 'Olivgrün', price: 60, style: { background: 'linear-gradient(160deg,#5c6b2a 0%,#9db35a 60%,#d6e3a1 100%)' } },
  { id: 'bg-silver', type: 'background', name: 'Silber', price: 60, style: { background: 'linear-gradient(160deg,#6d7380 0%,#b7bcc8 55%,#eef0f4 100%)' } },
  { id: 'bg-sunset', type: 'background', name: 'Sonnenuntergang', price: 150, style: { background: 'linear-gradient(180deg,#2b1055 0%,#d6336c 55%,#ffb347 100%)' } },
  { id: 'bg-night', type: 'background', name: 'Sternennacht', price: 200, style: { background: 'radial-gradient(circle at 20% 30%,#fff 0 1px,transparent 2px),radial-gradient(circle at 70% 20%,#fff 0 1px,transparent 2px),radial-gradient(circle at 45% 70%,#fff 0 1px,transparent 2px),radial-gradient(circle at 85% 65%,#fff 0 1px,transparent 2px),linear-gradient(180deg,#020617 0%,#1e1b4b 60%,#312e81 100%)', backgroundSize: '120px 80px,90px 70px,150px 90px,110px 100px,100% 100%' } },
  { id: 'bg-autumn', type: 'background', name: 'Herbstlaub', price: 150, style: { background: 'linear-gradient(160deg,#7a2e0e 0%,#d9731a 50%,#f6c453 100%)' } },
  // Animierte Hintergründe
  { id: 'bg-anim-aurora', type: 'background', name: 'Polarlicht', price: 350, animated: true, className: 'cos-bg-aurora' },
  { id: 'bg-anim-stars', type: 'background', name: 'Funkelnde Sterne', price: 300, animated: true, className: 'cos-bg-stars' },
  { id: 'bg-anim-matrix', type: 'background', name: 'Matrix-Regen', price: 400, animated: true, className: 'cos-bg-matrix' },
  { id: 'bg-anim-snow', type: 'background', name: 'Schneefall', price: 300, animated: true, className: 'cos-bg-snow' },
  { id: 'bg-anim-waves', type: 'background', name: 'Ozeanwellen', price: 300, animated: true, className: 'cos-bg-waves' },
  { id: 'bg-anim-boot', type: 'background', name: 'XP-Startbildschirm', price: 250, animated: true, className: 'cos-bg-boot' },
  // Rahmen
  { id: 'frame-none', type: 'frame', name: 'Kein Rahmen', price: 0, style: { boxShadow: '0 0 0 2px #fff' } },
  { id: 'frame-silver', type: 'frame', name: 'Silberrahmen', price: 80, style: { boxShadow: '0 0 0 2px #fff, 0 0 0 5px #a9b0bc, 0 0 0 6px #6d7380' } },
  { id: 'frame-xp', type: 'frame', name: 'XP-Rahmen', price: 120, style: { boxShadow: '0 0 0 2px #fff, 0 0 0 5px #3c9b3c, 0 0 0 8px #245edb' } },
  { id: 'frame-gold', type: 'frame', name: 'Goldrahmen', price: 200, style: { boxShadow: '0 0 0 2px #fff7c2, 0 0 0 6px #d4a017, 0 0 10px 6px rgba(255,200,40,.6)' } },
  { id: 'frame-rainbow', type: 'frame', name: 'Regenbogen', price: 300, style: { boxShadow: '0 0 0 2px #fff, 0 0 0 4px #e74c3c, 0 0 0 6px #f1c40f, 0 0 0 8px #2ecc71, 0 0 0 10px #3498db' } },
  // Animierte Rahmen
  { id: 'frame-anim-rainbow', type: 'frame', name: 'Regenbogen-Wirbel', price: 450, animated: true, className: 'cos-frame-spin' },
  { id: 'frame-anim-glow', type: 'frame', name: 'Pulsierendes Leuchten', price: 300, animated: true, className: 'cos-frame-glow' },
  { id: 'frame-anim-fire', type: 'frame', name: 'Feuerkranz', price: 500, animated: true, className: 'cos-frame-fire' },
  { id: 'frame-anim-ice', type: 'frame', name: 'Eiskristall', price: 400, animated: true, className: 'cos-frame-ice' },
  // Avatare (Grafik im Client)
  { id: 'av-robot', type: 'avatar', name: 'Roboter', price: 100 },
  { id: 'av-cat', type: 'avatar', name: 'Katze', price: 100 },
  { id: 'av-ghost', type: 'avatar', name: 'Gespenst', price: 120 },
  { id: 'av-astronaut', type: 'avatar', name: 'Astronaut', price: 150 },
  { id: 'av-frog', type: 'avatar', name: 'Frosch', price: 120 },
  { id: 'av-anim-robot', type: 'avatar', name: 'Roboter (animiert)', price: 300, animated: true },
  { id: 'av-anim-cat', type: 'avatar', name: 'Katze (animiert)', price: 300, animated: true },
  { id: 'av-anim-orb', type: 'avatar', name: 'XP-Kugel (animiert)', price: 400, animated: true },
  { id: 'av-anim-frog', type: 'avatar', name: 'Frosch (animiert)', price: 350, animated: true },
  // Clippy-Erweiterungen
  { id: 'clippy-hat-none', type: 'clippy-hat', name: 'Kein Hut', price: 0 },
  { id: 'clippy-hat-top', type: 'clippy-hat', name: 'Zylinder', price: 120 },
  { id: 'clippy-hat-party', type: 'clippy-hat', name: 'Partyhut', price: 80 },
  { id: 'clippy-hat-crown', type: 'clippy-hat', name: 'Krone', price: 300 },
  { id: 'clippy-hat-santa', type: 'clippy-hat', name: 'Weihnachtsmütze', price: 100 },
  { id: 'clippy-hat-grad', type: 'clippy-hat', name: 'Maturahut', price: 200 },
  { id: 'clippy-hat-cap', type: 'clippy-hat', name: 'Kappe', price: 80 },
  { id: 'clippy-glasses-none', type: 'clippy-glasses', name: 'Keine Brille', price: 0 },
  { id: 'clippy-glasses-sun', type: 'clippy-glasses', name: 'Sonnenbrille', price: 100 },
  { id: 'clippy-glasses-nerd', type: 'clippy-glasses', name: 'Hornbrille', price: 80 },
  { id: 'clippy-glasses-3d', type: 'clippy-glasses', name: '3D-Brille', price: 120 },
  { id: 'clippy-glasses-monocle', type: 'clippy-glasses', name: 'Monokel', price: 150 },
];

/** Was neue Profile automatisch tragen (alle kostenlos). */
export const DEFAULT_ITEMS = {
  background: 'bg-luna',
  frame: 'frame-none',
  clippyHat: 'clippy-hat-none',
  clippyGlasses: 'clippy-glasses-none',
};

export const STATIC_ITEMS_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));

/** Anteil am Kaufpreis, den Ersteller:innen eigener Artikel bekommen */
export const CREATOR_SHARE = 0.5;

// ─── Profil-Anpassung ──────────────────────────────────────────────────────

/** Farbschemata für die Profilseite (wie die XP-Designs Luna/Olive/Silber + Royale/Zune). */
export const PROFILE_THEMES = ['luna', 'olive', 'silver', 'royale', 'zune', 'rose'];

/** Vitrinen, die man auf dem Profil ein-/ausblenden und sortieren kann (wie bei Steam). */
export const SHOWCASES = ['badges', 'info', 'stats', 'posts', 'sudoku'];
