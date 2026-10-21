/**
 * Echtzeit-Verbindung von OSSXP (Socket.IO): Chat für chatterinoXP + persönliche Live-Updates.
 *
 * Berechtigungen:
 *  - Gäste (ohne gültiges Cookie) dürfen Channels betreten und mitlesen (Zuschauer-Modus).
 *  - Nur eingeloggte User dürfen schreiben – das wird HIER auf dem Server erzwungen,
 *    nicht nur in der UI.
 *  - Eingeloggte Sockets treten dem Raum `user:<id>` bei; darüber kommen Coins/XP/Abzeichen
 *    (`economy:update`, siehe economy/service.js) sofort in allen offenen Tabs an.
 *
 * Events (Client → Server):
 *   chat:init  (ack)                 → ack({ channels, user, readOnly })
 *   chat:join  (channel, ack)        → ack({ history }) | ack({ error })
 *   chat:leave (channel)
 *   chat:send  ({ channel, text }, ack)
 * Events (Server → Client):
 *   chat:hello     { channels, user, readOnly }
 *   chat:message   Message (user.badges = bis zu 2 Abzeichen-IDs)
 *   chat:viewers   { channel, count }
 *   economy:update { wallet, coins, xp, levelUp, badges, label }
 */
import { parse as parseCookies } from 'cookie';
import { config } from '../config.js';
import { messages, users } from '../db.js';
import { award, displayBadges } from '../economy/service.js';
import { userFromToken } from '../middleware/auth.js';
import { setIO, userRoom } from '../realtime.js';

const room = (channel) => `ch:${channel}`;

/** Abzeichen an Chat-Nachrichten hängen (dezent: max. 2 pro User). */
function withBadges(list) {
  const cache = new Map();
  return list.map((m) => {
    if (!m.user?.id) return m;
    if (!cache.has(m.user.id)) cache.set(m.user.id, displayBadges(m.user.id));
    return { ...m, user: { ...m.user, badges: cache.get(m.user.id) } };
  });
}

export function initChat(io) {
  const { channels, historySize, maxLength, slowModeMs } = config.chat;
  setIO(io);

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
    if (me) socket.join(userRoom(me.id));

    const hello = () => ({
      channels,
      user: me ? { id: me.id, username: me.username, color: me.color } : null,
      readOnly: !me,
    });
    socket.emit('chat:hello', hello());
    // Der Chat kann später geöffnet werden als die (gemeinsame) Verbindung – dann fragt er hier nach
    socket.on('chat:init', (ack) => typeof ack === 'function' && ack(hello()));

    socket.on('chat:join', (channel, ack) => {
      if (!channels.includes(channel)) return ack?.({ error: `Unbekannter Channel #${channel}` });
      socket.join(room(channel));
      ack?.({ history: withBadges(messages.recent(channel, historySize)) });
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

      const [message] = withBadges([messages.add({ channel, user, text })]);
      io.to(room(channel)).emit('chat:message', message);
      award(user.id, 'chat.message', message.id);
      reply({ ok: true });
    });

    // Beim Trennen die Zuschauerzahlen der betroffenen Channels aktualisieren
    socket.on('disconnecting', () => {
      const joined = [...socket.rooms].filter((r) => r.startsWith('ch:')).map((r) => r.slice(3));
      setImmediate(() => joined.forEach(broadcastViewers));
    });
  });
}
