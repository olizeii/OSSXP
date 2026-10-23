/**
 * SQLite-Datenbank (better-sqlite3, synchron & schnell) inkl. Schema und kleinen Repositories.
 * Für ein lokales Projekt reicht eine einzelne Datei völlig aus.
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config.js';

fs.mkdirSync(path.dirname(path.resolve(config.dbFile)), { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    color         TEXT    NOT NULL,
    avatar        TEXT,              -- NULL = Standardbild, "preset:<id>" oder data:-URL
    created_at    INTEGER NOT NULL
  );

  -- Verknüpfung eines Webseiten-Accounts mit einem WebUntis-Account (1:1)
  CREATE TABLE IF NOT EXISTS untis_links (
    user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    server       TEXT    NOT NULL,   -- z. B. "nessa.webuntis.com"
    school       TEXT    NOT NULL,   -- Schulname laut WebUntis-URL
    username     TEXT    NOT NULL,
    secret_enc   TEXT    NOT NULL,   -- AES-256-GCM-verschlüsseltes Passwort
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel    TEXT    NOT NULL,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username   TEXT    NOT NULL,
    color      TEXT    NOT NULL,
    text       TEXT    NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel, id);
`);

// ─── Migrationen für bestehende Datenbanken ────────────────────────────────
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('avatar')) db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
// Gespeicherte Rolle: 'user' | 'moderator' | 'admin' (Stammgast/Verifiziert/Neu werden berechnet, siehe roles.js)
if (!userColumns.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");

// ─── Users ──────────────────────────────────────────────────────────────────

const stmt = {
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
  insertUser: db.prepare(
    'INSERT INTO users (username, password_hash, color, created_at) VALUES (?, ?, ?, ?)',
  ),
  updateColor: db.prepare('UPDATE users SET color = ? WHERE id = ?'),
  updateRole: db.prepare('UPDATE users SET role = ? WHERE id = ?'),
  countRole: db.prepare('SELECT COUNT(*) AS n FROM users WHERE role = ?'),
  listRole: db.prepare('SELECT * FROM users WHERE role = ? ORDER BY username'),
  updateAvatar: db.prepare('UPDATE users SET avatar = ? WHERE id = ?'),

  linkByUser: db.prepare('SELECT * FROM untis_links WHERE user_id = ?'),
  upsertLink: db.prepare(`
    INSERT INTO untis_links (user_id, server, school, username, secret_enc, created_at, updated_at)
    VALUES (@userId, @server, @school, @username, @secretEnc, @now, @now)
    ON CONFLICT(user_id) DO UPDATE SET
      server = excluded.server, school = excluded.school, username = excluded.username,
      secret_enc = excluded.secret_enc, updated_at = excluded.updated_at
  `),
  deleteLink: db.prepare('DELETE FROM untis_links WHERE user_id = ?'),

  insertMessage: db.prepare(
    'INSERT INTO messages (channel, user_id, username, color, text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ),
  recentMessages: db.prepare(
    'SELECT * FROM (SELECT * FROM messages WHERE channel = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC',
  ),
};

export const users = {
  findById: (id) => stmt.userById.get(id) ?? null,
  findByName: (name) => stmt.userByName.get(name) ?? null,
  create({ username, passwordHash, color }) {
    const info = stmt.insertUser.run(username, passwordHash, color, Date.now());
    return users.findById(info.lastInsertRowid);
  },
  setColor: (id, color) => stmt.updateColor.run(color, id),
  setRole: (id, role) => stmt.updateRole.run(role, id),
  countRole: (role) => stmt.countRole.get(role).n,
  withRole: (role) => stmt.listRole.all(role),
  setAvatar: (id, avatar) => stmt.updateAvatar.run(avatar, id),
};

export const untisLinks = {
  findByUser: (userId) => stmt.linkByUser.get(userId) ?? null,
  upsert: ({ userId, server, school, username, secretEnc }) =>
    stmt.upsertLink.run({ userId, server, school, username, secretEnc, now: Date.now() }),
  remove: (userId) => stmt.deleteLink.run(userId),
};

/** Wandelt eine DB-Zeile in das öffentliche Nachrichtenformat für den Client um. */
const toMessage = (row) => ({
  id: row.id,
  channel: row.channel,
  user: { id: row.user_id, username: row.username, color: row.color },
  text: row.text,
  createdAt: row.created_at,
});

export const messages = {
  add({ channel, user, text }) {
    const createdAt = Date.now();
    const info = stmt.insertMessage.run(channel, user.id, user.username, user.color, text, createdAt);
    return toMessage({
      id: info.lastInsertRowid,
      channel,
      user_id: user.id,
      username: user.username,
      color: user.color,
      text,
      created_at: createdAt,
    });
  },
  recent: (channel, limit) => stmt.recentMessages.all(channel, limit).map(toMessage),
};
