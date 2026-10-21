/**
 * OSSXP – Backend-Einstiegspunkt.
 * Express (REST-API) + Socket.IO (Chat) auf einem HTTP-Server.
 * In Produktion liefert derselbe Server auch das gebaute Frontend (client/dist) aus.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';

import { config } from './config.js';
import { initChat } from './chat/socket.js';
import { attachUser } from './middleware/auth.js';
import { authRouter } from './routes/auth.js';
import { emotesRouter } from './routes/emotes.js';
import { untisRouter } from './routes/untis.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('trust proxy', 1);
// CSP aus, weil Emotes von externen CDNs (7TV, BTTV) geladen werden
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '128kb' })); // Platz für hochgeladene Benutzerbilder
app.use(cookieParser());
app.use(attachUser);

// ─── API ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, untisMode: config.untis.mock ? 'demo' : 'live' }));
app.use('/api/auth', authRouter);
app.use('/api/untis', untisRouter);
app.use('/api/emotes', emotesRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unbekannter API-Endpunkt.' }));

// ─── Frontend (nur nach `npm run build`) ───────────────────────────────────
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  // SPA-Fallback: alle übrigen GET-Anfragen bekommen die index.html
  app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

// ─── Fehlerbehandlung ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

initChat(io);

server.listen(config.port, () => {
  console.log(`OSSXP-Server läuft auf http://localhost:${config.port}`);
  if (config.untis.mock) console.log('Untis läuft im Demo-Modus (UNTIS_MOCK=true).');
});
