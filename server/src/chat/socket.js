/**
 * Echtzeit-Verbindung von OSSXP (Socket.IO): Chat, Privatnachrichten und persönliche Live-Updates.
 *
 * Berechtigungen (siehe roles.js):
 *  - Gäste lesen öffentliche Channels mit (Zuschauer-Modus).
 *  - Eingeloggte schreiben; „Neue Nutzer“ dürfen keine Links posten und haben einen längeren Slow-Mode.
 *  - Moderator:innen erstellen/löschen Channels und vergeben Timeouts (/timeout, /untimeout).
 *
 * Spam-Schutz: Wer zu schnell schreibt (Flood) oder dieselbe Nachricht wiederholt, bekommt automatisch
 * einen Timeout – mit jedem weiteren Verstoß doppelt so lang (30 s → 60 s → … max. 1 h).
 * XP gibt es nur für sinnvolle Nachrichten (mind. 2 Wörter, keine Wiederholung) und nur mit Cooldown.
 *
 * Events (Client → Server):
 *   chat:init (ack) · chat:join (channel, ack) · chat:leave (channel) · chat:send ({ channel, text }, ack)
 *   chat:createChannel ({ name }, ack) · chat:deleteChannel ({ name }, ack)
 *   dm:list (ack) · dm:history ({ username }, ack) · dm:send ({ to, text }, ack)
 * Events (Server → Client):
 *   chat:hello · chat:message · chat:viewers · chat:channels · chat:notice { channel, text }
 *   dm:message · economy:update · account:update
 */
import { parse as parseCookies } from 'cookie';
import { config } from '../config.js';
import { db, messages, users } from '../db.js';
import { award, displayBadges } from '../economy/service.js';
import { setEmoteChangeListener } from '../emotes/providers.js';
import { userFromToken } from '../middleware/auth.js';
import { emitToUser, setIO, userRoom } from '../realtime.js';
import { can, hasRank, rankOf } from '../roles.js';

// ─── Datenbank: Channels, Privatnachrichten, Timeouts ──────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_channels (
    name       TEXT PRIMARY KEY,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sort       INTEGER NOT NULL DEFAULT 100,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS direct_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text       TEXT    NOT NULL,
    created_at INTEGER NOT NULL,
    read_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(from_id, to_id, id);
  CREATE TABLE IF NOT EXISTS chat_timeouts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    until   INTEGER NOT NULL,
    reason  TEXT    NOT NULL,
    by_id   INTEGER,
    strikes INTEGER NOT NULL DEFAULT 0,
    last_strike_at INTEGER NOT NULL DEFAULT 0
  );
`);

const seedChannel = db.prepare('INSERT OR IGNORE INTO chat_channels (name, sort, created_at) VALUES (?, ?, ?)');
config.chat.channels.forEach((name, i) => seedChannel.run(name, i, Date.now()));

const stmt = {
  channels: db.prepare('SELECT name FROM chat_channels ORDER BY sort, created_at'),
  insertChannel: db.prepare('INSERT INTO chat_channels (name, created_by, created_at) VALUES (?, ?, ?)'),
  deleteChannel: db.prepare('DELETE FROM chat_channels WHERE name = ?'),
  insertDm: db.prepare('INSERT INTO direct_messages (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)'),
  dmHistory: db.prepare(`
    SELECT * FROM (SELECT * FROM direct_messages WHERE (from_id = @a AND to_id = @b) OR (from_id = @b AND to_id = @a)
    ORDER BY id DESC LIMIT 100) ORDER BY id`),
  dmRead: db.prepare('UPDATE direct_messages SET read_at = ? WHERE to_id = ? AND from_id = ? AND read_at IS NULL'),
  dmConversations: db.prepare(`
    SELECT CASE WHEN from_id = @me THEN to_id ELSE from_id END AS other, MAX(id) AS last_id,
      SUM(CASE WHEN to_id = @me AND read_at IS NULL THEN 1 ELSE 0 END) AS unread
    FROM direct_messages WHERE from_id = @me OR to_id = @me GROUP BY other ORDER BY last_id DESC LIMIT 50`),
  dmById: db.prepare('SELECT * FROM direct_messages WHERE id = ?'),
  timeout: db.prepare('SELECT * FROM chat_timeouts WHERE user_id = ?'),
  setTimeout: db.prepare(`
    INSERT INTO chat_timeouts (user_id, until, reason, by_id, strikes, last_strike_at) VALUES (@userId, @until, @reason, @byId, @strikes, @now)
    ON CONFLICT (user_id) DO UPDATE SET until = @until, reason = @reason, by_id = @byId, strikes = @strikes, last_strike_at = @now`),
  clearTimeout: db.prepare('UPDATE chat_timeouts SET until = 0 WHERE user_id = ?'),
};

const listChannels = () => stmt.channels.all().map((r) => r.name);
const room = (channel) => `ch:${channel}`;
const CHANNEL_RE = /^[a-z0-9_-]{2,24}$/;
const LINK_RE = /(https?:\/\/|www\.)\S+/i;

// ─── Abzeichen & Rang an Nachrichten ───────────────────────────────────────

function chatUser(user) {
  return { id: user.id, username: user.username, color: user.color, rank: rankOf(user), badges: displayBadges(user.id) };
}

/** Nachrichten aus der DB um aktuelle Abzeichen/Ränge ergänzen (max. 2 Abzeichen, dezent). */
function decorate(list) {
  const cache = new Map();
  return list.map((m) => {
    if (!m.user?.id) return m;
    if (!cache.has(m.user.id)) {
      const u = users.findById(m.user.id);
      cache.set(m.user.id, u ? { rank: rankOf(u), badges: displayBadges(u.id) } : {});
    }
    return { ...m, user: { ...m.user, ...cache.get(m.user.id) } };
  });
}

// ─── Spam-Erkennung ────────────────────────────────────────────────────────

const FLOOD_WINDOW_MS = 10_000;
const FLOOD_MAX = 5; // mehr als 5 Nachrichten in 10 s = Flood
const DUPLICATE_MAX = 3; // dieselbe Nachricht 3× in 60 s
const recent = new Map(); // userId → [{ at, text }]

const normalize = (text) => text.toLowerCase().replace(/\s+/g, ' ').trim();

function spamCheck(userId, text) {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((m) => now - m.at < 60_000);
  list.push({ at: now, text: normalize(text) });
  recent.set(userId, list);
  if (list.filter((m) => now - m.at < FLOOD_WINDOW_MS).length > FLOOD_MAX) return 'Flood (zu viele Nachrichten)';
  if (list.filter((m) => m.text === normalize(text)).length >= DUPLICATE_MAX) return 'Wiederholte Nachricht';
  return null;
}

/** Aktiver Timeout? → verbleibende Sekunden, sonst 0 */
function timeoutLeft(userId) {
  const t = stmt.timeout.get(userId);
  return t && t.until > Date.now() ? Math.ceil((t.until - Date.now()) / 1000) : 0;
}

/** Timeout setzen; automatische Timeouts verdoppeln sich mit jedem Verstoß innerhalb einer Stunde. */
function applyTimeout(userId, { seconds, reason, byId = null, auto = false }) {
  const now = Date.now();
  const prev = stmt.timeout.get(userId);
  const strikes = auto ? (prev && now - prev.last_strike_at < 3_600_000 ? prev.strikes + 1 : 1) : (prev?.strikes ?? 0);
  const duration = auto ? Math.min(3600, 30 * 2 ** (strikes - 1)) : seconds;
  stmt.setTimeout.run({ userId, until: now + duration * 1000, reason, byId, strikes, now });
  return duration;
}

// ─── Socket.IO ─────────────────────────────────────────────────────────────

export function initChat(io) {
  const { historySize, maxLength } = config.chat;
  setIO(io);
  // Neues Emote im OSSXP-Set → alle Clients laden die Liste neu
  setEmoteChangeListener(() => io.emit('emotes:update'));

  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie ?? '');
    socket.data.userId = userFromToken(cookies[config.auth.cookieName])?.id ?? null;
    socket.data.lastSentAt = 0;
    socket.data.lastRewardedText = '';
    next();
  });

  const broadcastViewers = (channel) => {
    const count = io.sockets.adapter.rooms.get(room(channel))?.size ?? 0;
    io.to(room(channel)).emit('chat:viewers', { channel, count });
  };
  const notice = (channel, text) => io.to(room(channel)).emit('chat:notice', { channel, text, at: Date.now() });

  io.on('connection', (socket) => {
    const me = socket.data.userId ? users.findById(socket.data.userId) : null;
    if (me) socket.join(userRoom(me.id));

    const hello = () => {
      const u = socket.data.userId ? users.findById(socket.data.userId) : null;
      return {
        channels: listChannels(),
        user: u ? chatUser(u) : null,
        readOnly: !u,
        canCreateChannels: can(u, 'createChannel'),
        canModerate: can(u, 'moderate'),
      };
    };
    socket.emit('chat:hello', hello());
    socket.on('chat:init', (ack) => typeof ack === 'function' && ack(hello()));

    socket.on('chat:join', (channel, ack) => {
      if (!listChannels().includes(channel)) return ack?.({ error: `Unbekannter Channel #${channel}` });
      socket.join(room(channel));
      ack?.({ history: decorate(messages.recent(channel, historySize)) });
      broadcastViewers(channel);
    });

    socket.on('chat:leave', (channel) => {
      socket.leave(room(channel));
      broadcastViewers(channel);
    });

    /** Befehle wie in Chatterino/Twitch */
    function command(user, channel, text, reply) {
      const [cmd, targetName, ...rest] = text.slice(1).split(' ');
      const target = targetName ? users.findByName(targetName.replace(/^@/, '')) : null;

      if (cmd === 'w' || cmd === 'whisper') {
        if (!target) return reply({ error: 'Benutzung: /w <name> <nachricht>' });
        return sendDm(user, target, rest.join(' '), reply);
      }
      if (cmd === 'help') {
        return reply({
          info: '/w <name> <text> – Privatnachricht' + (can(user, 'moderate') ? ' · /timeout <name> [sek] [grund] · /untimeout <name>' : ''),
        });
      }
      if (cmd === 'timeout' || cmd === 'untimeout') {
        if (!can(user, 'moderate')) return reply({ error: 'Nur Moderator:innen können Timeouts vergeben.' });
        if (!target) return reply({ error: `Benutzung: /${cmd} <name>${cmd === 'timeout' ? ' [sekunden] [grund]' : ''}` });
        if (hasRank(target, 'moderator')) return reply({ error: 'Moderator:innen können nicht gesperrt werden.' });
        if (cmd === 'untimeout') {
          stmt.clearTimeout.run(target.id);
          notice(channel, `${target.username} darf wieder schreiben.`);
          return reply({ ok: true });
        }
        const secs = Math.min(86400, Math.max(1, Number(rest[0]) || 600));
        const reason = rest.slice(Number(rest[0]) ? 1 : 0).join(' ') || 'von der Moderation';
        applyTimeout(target.id, { seconds: secs, reason, byId: user.id });
        notice(channel, `${target.username} wurde für ${secs} s stummgeschaltet (${reason}).`);
        return reply({ ok: true });
      }
      return reply({ error: `Unbekannter Befehl /${cmd} – /help zeigt alle.` });
    }

    socket.on('chat:send', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      if (!user) return reply({ error: 'Zuschauer-Modus: Bitte melden Sie sich an, um zu schreiben.' });

      const channel = String(payload?.channel ?? '');
      const text = String(payload?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!listChannels().includes(channel)) return reply({ error: 'Unbekannter Channel.' });
      if (!socket.rooms.has(room(channel))) return reply({ error: 'Channel nicht betreten.' });
      if (!text) return reply({ error: 'Leere Nachricht.' });
      if (text.length > maxLength) return reply({ error: `Maximal ${maxLength} Zeichen.` });
      if (text.startsWith('/')) return command(user, channel, text, reply);

      const left = timeoutLeft(user.id);
      if (left) return reply({ error: `Du bist noch ${left} s stummgeschaltet (${stmt.timeout.get(user.id).reason}).` });

      const isNew = !hasRank(user, 'verified');
      if (isNew && LINK_RE.test(text)) return reply({ error: 'Neue Nutzer:innen dürfen noch keine Links posten.' });

      const now = Date.now();
      const slowMode = isNew ? 3000 : config.chat.slowModeMs;
      if (now - socket.data.lastSentAt < slowMode) return reply({ error: 'Langsamer! (Slow-Mode)' });
      socket.data.lastSentAt = now;

      // Spam → automatischer Timeout (Moderator:innen sind ausgenommen)
      const spam = !hasRank(user, 'moderator') && spamCheck(user.id, text);
      if (spam) {
        const secs = applyTimeout(user.id, { reason: spam, auto: true });
        notice(channel, `${user.username} wurde automatisch für ${secs} s stummgeschaltet (${spam}).`);
        return reply({ error: `Spam erkannt – du bist für ${secs} s stummgeschaltet.` });
      }

      const [message] = decorate([messages.add({ channel, user, text })]);
      io.to(room(channel)).emit('chat:message', message);

      // XP nur für sinnvolle Nachrichten: mind. 2 Wörter und 8 Zeichen, keine Wiederholung
      const meaningful = text.split(' ').length >= 2 && text.length >= 8 && normalize(text) !== socket.data.lastRewardedText;
      if (meaningful) {
        const result = award(user.id, 'chat.message', message.id);
        if (result && !result.limited) socket.data.lastRewardedText = normalize(text);
      }
      reply({ ok: true });
    });

    // ── Channels verwalten (ab Moderator) ──
    socket.on('chat:createChannel', ({ name } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      if (!can(user, 'createChannel')) return reply({ error: 'Channels können erst ab Rang „Moderator“ erstellt werden.' });
      const channel = String(name ?? '').toLowerCase().replace(/^#/, '');
      if (!CHANNEL_RE.test(channel)) return reply({ error: 'Name: 2–24 Zeichen (a–z, 0–9, _ und -).' });
      if (listChannels().includes(channel)) return reply({ error: `#${channel} gibt es schon.` });
      stmt.insertChannel.run(channel, user.id, Date.now());
      io.emit('chat:channels', listChannels());
      reply({ ok: true, channel });
    });

    socket.on('chat:deleteChannel', ({ name } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      if (!can(user, 'moderate')) return reply({ error: 'Nur Moderator:innen können Channels löschen.' });
      if (name === listChannels()[0]) return reply({ error: 'Der allgemeine Channel bleibt bestehen.' });
      stmt.deleteChannel.run(String(name));
      io.emit('chat:channels', listChannels());
      reply({ ok: true });
    });

    // ── Privatnachrichten ──
    const toDm = (row, a, b) => ({
      id: `dm-${row.id}`,
      from: row.from_id === a.id ? a.username : b.username,
      to: row.to_id === a.id ? a.username : b.username,
      text: row.text,
      createdAt: row.created_at,
    });

    function sendDm(user, target, text, reply) {
      const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
      if (!target) return reply({ error: 'User nicht gefunden.' });
      if (target.id === user.id) return reply({ error: 'Du kannst dir nicht selbst schreiben.' });
      if (!clean || clean.length > maxLength) return reply({ error: `Nachricht: 1–${maxLength} Zeichen.` });
      const left = timeoutLeft(user.id);
      if (left) return reply({ error: `Du bist noch ${left} s stummgeschaltet.` });
      if (!hasRank(user, 'verified') && LINK_RE.test(clean)) return reply({ error: 'Neue Nutzer:innen dürfen noch keine Links senden.' });
      if (!hasRank(user, 'moderator') && spamCheck(user.id, clean)) {
        const secs = applyTimeout(user.id, { reason: 'Spam in Privatnachrichten', auto: true });
        return reply({ error: `Spam erkannt – du bist für ${secs} s stummgeschaltet.` });
      }
      const id = stmt.insertDm.run(user.id, target.id, clean, Date.now()).lastInsertRowid;
      const dm = toDm(stmt.dmById.get(id), user, target);
      emitToUser(user.id, 'dm:message', { ...dm, partner: { username: target.username, color: target.color } });
      emitToUser(target.id, 'dm:message', { ...dm, partner: { username: user.username, color: user.color } });
      reply({ ok: true });
    }

    socket.on('dm:send', ({ to, text } = {}, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      if (!user) return reply({ error: 'Bitte anmelden.' });
      sendDm(user, users.findByName(String(to ?? '')), text, reply);
    });

    socket.on('dm:history', ({ username } = {}, ack) => {
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      const other = users.findByName(String(username ?? ''));
      if (!user || !other || typeof ack !== 'function') return ack?.({ error: 'Nicht gefunden.' });
      stmt.dmRead.run(Date.now(), user.id, other.id);
      ack({
        partner: { username: other.username, color: other.color },
        messages: stmt.dmHistory.all({ a: user.id, b: other.id }).map((r) => toDm(r, user, other)),
      });
    });

    socket.on('dm:list', (ack) => {
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      if (!user || typeof ack !== 'function') return ack?.({ conversations: [] });
      ack({
        conversations: stmt.dmConversations.all({ me: user.id }).map((c) => {
          const other = users.findById(c.other);
          const last = stmt.dmById.get(c.last_id);
          return {
            partner: { username: other?.username ?? '?', color: other?.color ?? '#888' },
            last: { text: last.text, createdAt: last.created_at, fromMe: last.from_id === user.id },
            unread: c.unread,
          };
        }),
      });
    });

    socket.on('disconnecting', () => {
      const joined = [...socket.rooms].filter((r) => r.startsWith('ch:')).map((r) => r.slice(3));
      setImmediate(() => joined.forEach(broadcastViewers));
    });
  });
}
