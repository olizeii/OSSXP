/**
 * OSSXP – Backend-Einstiegspunkt.
 * Express (REST-API) + Socket.IO (Chat) auf einem HTTP-Server.
 * In Produktion liefert derselbe Server auch das gebaute Frontend (client/dist) aus.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { Server } from 'socket.io';

import { config } from './config.js';
import { initChat } from './chat/socket.js';
import { attachUser } from './middleware/auth.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { seedAdmin } from './seed.js';
import { economyRouter, profileRouter } from './routes/economy.js';
import { emotesRouter } from './routes/emotes.js';
import { mollyRouter } from './routes/molly.js';
import { newsRouter } from './routes/news.js';
import { redRouter } from './routes/red.js';
import { sudokuRouter } from './routes/sudoku.js';
import { untisRouter } from './routes/untis.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.set('trust proxy', 1);
// CSP aus, weil Emotes von externen CDNs (7TV, BTTV) geladen werden
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression()); // u. a. die Emote-Liste (mehrere Tausend Einträge) wird so ~6× kleiner
app.use(express.json({ limit: '128kb' })); // Platz für hochgeladene Benutzerbilder
app.use(cookieParser());
app.use(attachUser);

// ─── API ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, untisMode: config.untis.mock ? 'demo' : 'live' }));
app.use('/api/auth', authRouter);
app.use('/api/untis', untisRouter);
app.use('/api/emotes', emotesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/economy', economyRouter);
app.use('/api/profiles', profileRouter);
app.use('/api/sudoku', sudokuRouter);
app.use('/api/red', redRouter);
app.use('/api/molly', mollyRouter);
app.use('/api/news', newsRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unbekannter API-Endpunkt.' }));

// ─── Frontend (nur nach `npm run build`) ───────────────────────────────────
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  // Gehashte Assets dürfen lange gecacht werden, die index.html nie (sonst zeigt sie nach einem
  // neuen Build auf Dateien, die es nicht mehr gibt)
  app.use(
    express.static(dist, {
      setHeaders: (res, file) =>
        res.set('Cache-Control', file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'),
    }),
  );
  // SPA-Fallback: alle übrigen GET-Anfragen bekommen die index.html
  app.use((req, res, next) =>
    req.method === 'GET' ? (res.set('Cache-Control', 'no-cache'), res.sendFile(path.join(dist, 'index.html'))) : next(),
  );
}

// ─── Fehlerbehandlung ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

initChat(io);
seedAdmin();

server.listen(config.port, () => {
  console.log(`OSSXP-Server läuft auf http://localhost:${config.port}`);
  if (config.untis.mock) console.log('Untis läuft im Demo-Modus (UNTIS_MOCK=true).');
});
