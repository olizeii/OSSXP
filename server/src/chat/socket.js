/**
 * Echtzeit-Chat für chatterinoXP (Socket.IO).
 *
 * Berechtigungen:
 *  - Gäste (ohne gültiges Cookie) dürfen Channels betreten und mitlesen (Zuschauer-Modus).
 *  - Nur eingeloggte User dürfen schreiben – das wird HIER auf dem Server erzwungen,
 *    nicht nur in der UI.
 *
 * Events (Client → Server):
 *   chat:join  (channel, ack)        → ack({ history }) | ack({ error })
 *   chat:leave (channel)
 *   chat:send  ({ channel, text }, ack)
 * Events (Server → Client):
 *   chat:hello   { channels, user, readOnly }
 *   chat:message Message
 *   chat:viewers { channel, count }
 */
import { parse as parseCookies } from 'cookie';
import { config } from '../config.js';
import { messages, users } from '../db.js';
import { userFromToken } from '../middleware/auth.js';

const room = (channel) => `ch:${channel}`;

export function initChat(io) {
  const { channels, historySize, maxLength, slowModeMs } = config.chat;

  // Handshake: User aus dem Auth-Cookie lesen (Socket.IO schickt Cookies bei same-origin mit)
  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie ?? '');
    socket.data.userId = userFromToken(cookies[config.auth.cookieName])?.id ?? null;
    socket.data.lastSentAt = 0;
    next();
  });

  const broadcastViewers = (channel) => {
    const count = io.sockets.adapter.rooms.get(room(channel))?.size ?? 0;
    io.to(room(channel)).emit('chat:viewers', { channel, count });
  };

  io.on('connection', (socket) => {
    const me = socket.data.userId ? users.findById(socket.data.userId) : null;

    socket.emit('chat:hello', {
      channels,
      user: me ? { id: me.id, username: me.username, color: me.color } : null,
      readOnly: !me,
    });

    socket.on('chat:join', (channel, ack) => {
      if (!channels.includes(channel)) return ack?.({ error: `Unbekannter Channel #${channel}` });
      socket.join(room(channel));
      ack?.({ history: messages.recent(channel, historySize) });
      broadcastViewers(channel);
    });

    socket.on('chat:leave', (channel) => {
      socket.leave(room(channel));
      broadcastViewers(channel);
    });

    socket.on('chat:send', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};

      // Aktuellen Stand frisch aus der DB holen (z. B. geänderte Namensfarbe)
      const user = socket.data.userId ? users.findById(socket.data.userId) : null;
      if (!user) return reply({ error: 'Zuschauer-Modus: Bitte melden Sie sich an, um zu schreiben.' });

      const channel = String(payload?.channel ?? '');
      const text = String(payload?.text ?? '').replace(/\s+/g, ' ').trim();
      if (!channels.includes(channel)) return reply({ error: 'Unbekannter Channel.' });
      if (!socket.rooms.has(room(channel))) return reply({ error: 'Channel nicht betreten.' });
      if (!text) return reply({ error: 'Leere Nachricht.' });
      if (text.length > maxLength) return reply({ error: `Maximal ${maxLength} Zeichen.` });

      const now = Date.now();
      if (now - socket.data.lastSentAt < slowModeMs) return reply({ error: 'Langsamer! (Slow-Mode)' });
      socket.data.lastSentAt = now;

      const message = messages.add({ channel, user, text });
      io.to(room(channel)).emit('chat:message', message);
      reply({ ok: true });
    });

    // Beim Trennen die Zuschauerzahlen der betroffenen Channels aktualisieren
    socket.on('disconnecting', () => {
      const joined = [...socket.rooms].filter((r) => r.startsWith('ch:')).map((r) => r.slice(3));
      setImmediate(() => joined.forEach(broadcastViewers));
    });
  });
}
