/**
 * Tägliches Sudoku + globale Bestenliste (SudoXP).
 *   GET  /api/sudoku/daily                 Rätsel des Tages (ohne Lösung) + Start-Token
 *   POST /api/sudoku/daily/submit          { token, values } → Prüfung, Zeit, Platz, Belohnung
 *   GET  /api/sudoku/daily/scoreboard      Bestenliste (?date=)
 *
 * Die Zeit misst der Server (Start beim Abholen des Rätsels, Ende beim Einreichen).
 * Eingeloggte User behalten ihre Startzeit, auch wenn sie das Rätsel neu laden.
 * Ohne Login erscheint man als „Anonym“.
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { db } from '../db.js';
import { award, grantBadge } from '../economy/service.js';
import { dailyPuzzle } from '../games/sudoku.js';
import { addDays, isIsoDate, zonedNow } from '../untis/time.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS sudoku_daily_starts (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    started_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, date)
  );
  CREATE TABLE IF NOT EXISTS sudoku_daily_results (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    date       TEXT    NOT NULL,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nonce      TEXT    NOT NULL UNIQUE,     -- ein Token = eine Wertung (auch für Anonyme)
    seconds    INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (date, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sudoku_results_date ON sudoku_daily_results(date, seconds);
`);

const stmt = {
  start: db.prepare('SELECT started_at FROM sudoku_daily_starts WHERE user_id = ? AND date = ?'),
  insertStart: db.prepare('INSERT OR IGNORE INTO sudoku_daily_starts (user_id, date, started_at) VALUES (?, ?, ?)'),
  resultOf: db.prepare('SELECT * FROM sudoku_daily_results WHERE date = ? AND user_id = ?'),
  insertResult: db.prepare('INSERT INTO sudoku_daily_results (date, user_id, nonce, seconds, created_at) VALUES (?, ?, ?, ?, ?)'),
  rank: db.prepare('SELECT COUNT(*) + 1 AS rank FROM sudoku_daily_results WHERE date = ? AND (seconds < ? OR (seconds = ? AND id < ?))'),
  total: db.prepare('SELECT COUNT(*) AS n FROM sudoku_daily_results WHERE date = ?'),
  top: db.prepare(`
    SELECT r.id, r.seconds, r.created_at, u.username, u.color
    FROM sudoku_daily_results r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.date = ? ORDER BY r.seconds, r.id LIMIT 25`),
  userDates: db.prepare('SELECT date FROM sudoku_daily_results WHERE user_id = ? ORDER BY date DESC LIMIT 60'),
};

export const sudokuRouter = Router();

const today = () => zonedNow(config.untis.timezone).date;
const submitLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

sudokuRouter.get('/daily', (req, res) => {
  const date = today();
  const { puzzle, difficulty } = dailyPuzzle(date);
  let startedAt = Date.now();
  let solved = null;

  if (req.user) {
    stmt.insertStart.run(req.user.id, date, startedAt);
    startedAt = stmt.start.get(req.user.id, date).started_at;
    const result = stmt.resultOf.get(date, req.user.id);
    if (result) {
      solved = { seconds: result.seconds, rank: stmt.rank.get(date, result.seconds, result.seconds, result.id).rank };
      // Belohnung nachbuchen, falls sie beim Lösen fehlgeschlagen ist (Ledger verhindert Doppelbuchung)
      award(req.user.id, 'sudoku.daily', date);
    }
  }

  const token = jwt.sign({ d: date, s: startedAt, n: crypto.randomUUID() }, config.auth.jwtSecret, { expiresIn: '2d' });
  res.json({ date, difficulty, puzzle, token, startedAt, solved });
});

/** Aufeinanderfolgende gelöste Tage bis heute. */
function streakOf(userId) {
  const dates = new Set(stmt.userDates.all(userId).map((r) => r.date));
  let streak = 0;
  for (let d = today(); dates.has(d); d = addDays(d, -1)) streak++;
  return streak;
}

sudokuRouter.post('/daily/submit', submitLimiter, (req, res) => {
  let token;
  try {
    token = jwt.verify(String(req.body?.token ?? ''), config.auth.jwtSecret);
  } catch {
    return res.status(400).json({ error: 'Ungültiges oder abgelaufenes Rätsel – bitte neu laden.' });
  }
  const values = req.body?.values;
  const { puzzle, solution } = dailyPuzzle(token.d);
  const valid =
    Array.isArray(values) &&
    values.length === 81 &&
    values.every((v, i) => Number.isInteger(v) && v === solution[i] && (!puzzle[i] || puzzle[i] === v));
  if (!valid) return res.status(422).json({ error: 'Das ist leider noch nicht die richtige Lösung.' });

  const userId = req.user?.id ?? null;
  if (userId) {
    const existing = stmt.resultOf.get(token.d, userId);
    if (existing) {
      const rank = stmt.rank.get(token.d, existing.seconds, existing.seconds, existing.id).rank;
      return res.json({ date: token.d, seconds: existing.seconds, rank, total: stmt.total.get(token.d).n, alreadySolved: true });
    }
  }

  const seconds = Math.max(5, Math.round((Date.now() - token.s) / 1000));
  let id;
  try {
    id = stmt.insertResult.run(token.d, userId, token.n, seconds, Date.now()).lastInsertRowid;
  } catch {
    return res.status(409).json({ error: 'Dieses Rätsel wurde bereits gewertet.' });
  }
  const rank = stmt.rank.get(token.d, seconds, seconds, id).rank;

  let reward = null;
  if (userId) {
    reward = award(userId, 'sudoku.daily', token.d);
    const streak = streakOf(userId);
    if (streak >= 3) grantBadge(userId, 'sudoku-streak-3');
    if (streak >= 7) grantBadge(userId, 'sudoku-streak-7');
    if (rank === 1) grantBadge(userId, 'sudoku-fastest');
    if (rank <= 3) award(userId, 'sudoku.podium', token.d); // Qualitäts-Bonus für die Top 3
  }
  res.json({ date: token.d, seconds, rank, total: stmt.total.get(token.d).n, reward });
});

sudokuRouter.get('/daily/scoreboard', (req, res) => {
  const date = isIsoDate(req.query.date) ? req.query.date : today();
  const entries = stmt.top.all(date).map((r, i) => ({
    rank: i + 1,
    seconds: r.seconds,
    at: r.created_at,
    user: r.username ? { username: r.username, color: r.color } : null,
  }));
  res.json({ date, total: stmt.total.get(date).n, entries });
});
