/**
 * Kataloge des OSSXP-Ökosystems – die einzige Quelle für Belohnungen, Abzeichen und Shop-Artikel.
 * Der Client lädt sie über GET /api/economy/catalog, damit nichts doppelt gepflegt wird.
 *
 * Neue Belohnung/neues Abzeichen/neuer Artikel = hier einen Eintrag hinzufügen.
 */

/**
 * Belohnungen pro Aktion. `dailyCap` = wie oft pro Tag die Aktion belohnt wird
 * (darüber hinaus wird sie nur gezählt). Jede Belohnung hat zusätzlich eine eindeutige
 * Referenz (z. B. die Post-ID), damit nichts doppelt ausgezahlt wird.
 */
export const REWARDS = {
  'daily.login': { xp: 5, coins: 5, dailyCap: 1, label: 'Täglicher Besuch' },
  'chat.message': { xp: 1, coins: 0, dailyCap: 40, label: 'Chat-Nachricht' },
  'red.post': { xp: 10, coins: 3, dailyCap: 5, label: 'Beitrag in redXP' },
  'red.comment': { xp: 3, coins: 1, dailyCap: 20, label: 'Kommentar in redXP' },
  'red.upvote_received': { xp: 2, coins: 1, dailyCap: 50, label: 'Upvote erhalten' },
  'molly.upload': { xp: 25, coins: 15, dailyCap: 5, label: 'Upload in MollyXP' },
  'sudoku.daily': { xp: 30, coins: 20, dailyCap: 1, label: 'Tägliches Sudoku gelöst' },
  'untis.linked': { xp: 20, coins: 25, dailyCap: 1, label: 'Untis verknüpft' },
};

/** Bonus-Coins bei jedem Level-Aufstieg */
export const LEVEL_UP_COINS = 10;

/** Gesamt-XP, die für ein Level nötig sind: 1 → 0, 2 → 50, 3 → 150, 4 → 300, 5 → 500 … */
export const xpForLevel = (level) => 25 * level * (level - 1);

export function levelInfo(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, xp, levelXp: xp - base, levelSpan: next - base };
}

/**
 * Abzeichen. `icon` ist ein kurzes Zeichen, das im Client auf einer XP-Medaille dargestellt wird,
 * `color` die Medaillenfarbe. Vergeben werden sie in economy/service.js (checkBadges).
 */
export const BADGES = [
  { id: 'welcome', name: 'Willkommen', description: 'Ein OSSXP-Konto erstellt.', icon: '★', color: '#3a7bd5' },
  { id: 'untis', name: 'Verknüpft', description: 'Konto mit Untis verknüpft.', icon: 'U', color: '#e8601c' },
  { id: 'chatter', name: 'Plaudertasche', description: '100 Nachrichten im chatterinoXP geschrieben.', icon: '✎', color: '#8a2be2' },
  { id: 'first-post', name: 'Erster Beitrag', description: 'Den ersten Beitrag in redXP verfasst.', icon: '¶', color: '#ff5a1f' },
  { id: 'upvoted', name: 'Beliebt', description: '50 Upvotes in redXP erhalten.', icon: '▲', color: '#ff8a00' },
  { id: 'note-taker', name: 'Mitschreiber', description: 'Die erste Mitschrift oder den ersten Test in MollyXP geteilt.', icon: '✐', color: '#2e8b57' },
  { id: 'librarian', name: 'Bibliothekar', description: '10 Uploads in MollyXP.', icon: '❖', color: '#1f6f43' },
  { id: 'sudoku-daily', name: 'Tagesrätsel', description: 'Das erste tägliche Sudoku gelöst.', icon: '9', color: '#1d5fe0' },
  { id: 'sudoku-streak-3', name: 'Sudoku Streak', description: '3 Tage in Folge das tägliche Sudoku gelöst.', icon: '3', color: '#d9730d' },
  { id: 'sudoku-streak-7', name: 'Sudoku-Marathon', description: '7 Tage in Folge das tägliche Sudoku gelöst.', icon: '7', color: '#c0392b' },
  { id: 'sudoku-fastest', name: 'Schnellster Löser', description: 'Platz 1 im täglichen Sudoku.', icon: '⚡', color: '#d4a017' },
  { id: 'level-5', name: 'Stammgast', description: 'Level 5 erreicht.', icon: '5', color: '#5f9ea0' },
  { id: 'level-10', name: 'Veteran', description: 'Level 10 erreicht.', icon: 'X', color: '#4b0082' },
];

export const BADGE_IDS = new Set(BADGES.map((b) => b.id));

/**
 * Shop-Artikel. `style` wird im Client direkt als CSS angewendet
 * (Hintergrund: auf den Profilkopf, Rahmen: auf das Profilbild).
 * `asset` verweist auf ein Bild im Client (z. B. das Desktop-Hintergrundbild).
 */
export const SHOP_ITEMS = [
  // Profil-Hintergründe
  { id: 'bg-luna', type: 'background', name: 'Luna Blau', price: 0, style: { background: 'linear-gradient(160deg,#0a3ab5 0%,#2f7ff0 55%,#7fb6ff 100%)' } },
  { id: 'bg-bliss', type: 'background', name: 'Pixel-Hügel', price: 80, asset: 'wallpaper' },
  { id: 'bg-olive', type: 'background', name: 'Olivgrün', price: 60, style: { background: 'linear-gradient(160deg,#5c6b2a 0%,#9db35a 60%,#d6e3a1 100%)' } },
  { id: 'bg-silver', type: 'background', name: 'Silber', price: 60, style: { background: 'linear-gradient(160deg,#6d7380 0%,#b7bcc8 55%,#eef0f4 100%)' } },
  { id: 'bg-sunset', type: 'background', name: 'Sonnenuntergang', price: 150, style: { background: 'linear-gradient(180deg,#2b1055 0%,#d6336c 55%,#ffb347 100%)' } },
  { id: 'bg-night', type: 'background', name: 'Sternennacht', price: 200, style: { background: 'radial-gradient(circle at 20% 30%,#fff 0 1px,transparent 2px),radial-gradient(circle at 70% 20%,#fff 0 1px,transparent 2px),radial-gradient(circle at 45% 70%,#fff 0 1px,transparent 2px),radial-gradient(circle at 85% 65%,#fff 0 1px,transparent 2px),linear-gradient(180deg,#020617 0%,#1e1b4b 60%,#312e81 100%)', backgroundSize: '120px 80px,90px 70px,150px 90px,110px 100px,100% 100%' } },
  { id: 'bg-matrix', type: 'background', name: 'Matrix', price: 250, style: { background: 'repeating-linear-gradient(90deg,rgba(0,255,90,.18) 0 2px,transparent 2px 14px),linear-gradient(180deg,#000 0%,#032b12 100%)' } },
  { id: 'bg-autumn', type: 'background', name: 'Herbstlaub', price: 150, style: { background: 'linear-gradient(160deg,#7a2e0e 0%,#d9731a 50%,#f6c453 100%)' } },
  // Rahmen ums Profilbild
  { id: 'frame-none', type: 'frame', name: 'Kein Rahmen', price: 0, style: { boxShadow: '0 0 0 2px #fff' } },
  { id: 'frame-silver', type: 'frame', name: 'Silberrahmen', price: 80, style: { boxShadow: '0 0 0 2px #fff, 0 0 0 5px #a9b0bc, 0 0 0 6px #6d7380' } },
  { id: 'frame-xp', type: 'frame', name: 'XP-Rahmen', price: 120, style: { boxShadow: '0 0 0 2px #fff, 0 0 0 5px #3c9b3c, 0 0 0 8px #245edb' } },
  { id: 'frame-gold', type: 'frame', name: 'Goldrahmen', price: 200, style: { boxShadow: '0 0 0 2px #fff7c2, 0 0 0 6px #d4a017, 0 0 10px 6px rgba(255,200,40,.6)' } },
  { id: 'frame-rainbow', type: 'frame', name: 'Regenbogen', price: 300, style: { boxShadow: '0 0 0 2px #fff, 0 0 0 4px #e74c3c, 0 0 0 6px #f1c40f, 0 0 0 8px #2ecc71, 0 0 0 10px #3498db' } },
];

export const DEFAULT_ITEMS = { background: 'bg-luna', frame: 'frame-none' };
export const ITEMS_BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));
