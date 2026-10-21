/**
 * Zentrale Server-Konfiguration.
 * Alle Werte kommen aus Umgebungsvariablen (server/.env), mit sicheren Defaults für die Entwicklung.
 */
import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

/** Liest ein Pflicht-Geheimnis. In Produktion ohne Wert → Abbruch, im Dev ein unsicherer Platzhalter. */
function secret(name) {
  const value = process.env[name];
  if (value) return value;
  if (isProd) {
    console.error(`[config] ${name} ist nicht gesetzt – in Produktion ist das Pflicht.`);
    process.exit(1);
  }
  console.warn(`[config] ${name} fehlt – verwende unsicheren Entwicklungs-Schlüssel.`);
  return `dev-insecure-${name.toLowerCase()}`;
}

const list = (value, fallback = '') =>
  (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3001),

  auth: {
    jwtSecret: secret('JWT_SECRET'),
    cookieName: 'ossxp_token',
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    tokenTtlSeconds: 60 * 60 * 24 * 7, // 7 Tage
  },

  dbFile: process.env.DB_FILE ?? './data/ossxp.db',
  /** Ordner für Uploads (MollyXP, NewsXP) */
  uploadDir: process.env.UPLOAD_DIR ?? './data/uploads',
  /** Benutzernamen mit Admin-Rechten (z. B. News veröffentlichen), kommagetrennt */
  adminUsernames: list(process.env.ADMIN_USERNAMES).map((n) => n.toLowerCase()),

  untis: {
    secret: secret('UNTIS_SECRET'),
    mock: process.env.UNTIS_MOCK === 'true',
    /** Zeitzone der Schule – bestimmt „jetzt“ für Live-Status, freie Räume usw. */
    timezone: process.env.UNTIS_TIMEZONE || 'Europe/Vienna',
    clientName: 'OSSXP',
    timeoutMs: 10_000,
    /** WebUntis beendet Sessions nach ~10 min Inaktivität – wir loggen nach 8 min neu ein. */
    sessionIdleMs: 8 * 60_000,
    /**
     * Lehrerverzeichnis für volle Namen zu den Kürzeln, pro Schule.
     * HTL Hollabrunn ist voreingestellt; weitere Schulen: TEACHER_DIRECTORY_<SCHULE>=url
     */
    teacherDirectories: {
      'htl-hl': process.env.TEACHER_DIRECTORY_HTL_HL ?? 'https://www.htl-hl.ac.at/services/teachers/teachers.php',
      ...Object.fromEntries(
        Object.entries(process.env)
          .filter(([k]) => k.startsWith('TEACHER_DIRECTORY_') && k !== 'TEACHER_DIRECTORY_HTL_HL')
          .map(([k, v]) => [k.slice('TEACHER_DIRECTORY_'.length).toLowerCase().replaceAll('_', '-'), v]),
      ),
    },
    /** Manuelle Korrekturen: "KÜRZEL=Nachname Vorname; …" */
    teacherNameOverrides: process.env.UNTIS_TEACHER_NAMES ?? '',
  },

  chat: {
    channels: list(process.env.CHAT_CHANNELS, 'allgemein,schule,gaming,offtopic'),
    historySize: 100,
    maxLength: 500,
    slowModeMs: 750,
  },

  emotes: {
    twitchIds: list(process.env.EMOTE_TWITCH_IDS),
    cacheTtlMs: 60 * 60_000,
  },
};
