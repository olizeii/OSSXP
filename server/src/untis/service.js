/**
 * Untis-Service: verwaltet einen WebUntis-Client pro verknüpftem OSSXP-User
 * und normalisiert die Rohdaten in ein einfaches, UI-freundliches Format
 * (Feldnamen wie in UntisDashboard: date, start, end, subjects, teachers, rooms, status …).
 */
import { config } from '../config.js';
import { UntisClient } from './client.js';
import { decrypt } from './crypto.js';
import { UntisError } from './errors.js';
import { mockSource } from './mock.js';

// ─── Hilfsfunktionen für Untis-Datumsformate ───────────────────────────────

/** "2026-10-21" → 20261021 */
export const isoToUntis = (iso) => Number(iso.replaceAll('-', ''));
/** 20261021 → "2026-10-21" */
export const untisToIso = (n) => {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};
/** 745 → "07:45" */
export const untisTime = (n) => String(n).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2');
const toMin = (n) => Math.floor(n / 100) * 60 + (n % 100);

/**
 * Akzeptiert sowohl "nessa.webuntis.com" als auch komplette URLs wie
 * "https://nessa.webuntis.com/WebUntis/?school=abc-schule#/basic/login"
 * und liefert { server, school? }.
 */
export function parseServerInput(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { server: '' };
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return { server: url.host.toLowerCase(), school: url.searchParams.get('school') ?? undefined };
  } catch {
    return { server: raw.toLowerCase() };
  }
}

// ─── Normalisierung ────────────────────────────────────────────────────────

const ref = (e) => ({
  name: e?.name ?? '',
  longName: e?.longname ?? '',
  ...(e?.orgname ? { original: { name: e.orgname } } : {}),
});

function normalizeLesson(l) {
  const status = l.code === 'cancelled' ? 'cancelled' : l.code === 'irregular' ? 'irregular' : 'regular';
  return {
    id: String(l.id),
    date: untisToIso(l.date),
    start: untisTime(l.startTime),
    end: untisTime(l.endTime),
    startMin: toMin(l.startTime),
    endMin: toMin(l.endTime),
    subjects: (l.su ?? []).map(ref),
    teachers: (l.te ?? []).map(ref),
    rooms: (l.ro ?? []).map(ref),
    classes: (l.kl ?? []).map(ref),
    status,
    info: l.info ?? '',
    substText: l.substText ?? '',
    text: l.lstext ?? '',
  };
}

// ─── Live-Quelle (echtes WebUntis) ─────────────────────────────────────────

/** Ein Client pro User, solange sich die Zugangsdaten nicht ändern. */
const clients = new Map(); // userId → { client, fingerprint }

function clientFor(link) {
  const fingerprint = `${link.server}|${link.school}|${link.username}|${link.updated_at}`;
  const cached = clients.get(link.user_id);
  if (cached?.fingerprint === fingerprint) return cached.client;

  const client = new UntisClient({
    server: link.server,
    school: link.school,
    username: link.username,
    password: decrypt(link.secret_enc),
  });
  clients.set(link.user_id, { client, fingerprint });
  return client;
}

/** Welches Element (Schüler, Lehrer, Klasse) gehört zum eingeloggten Untis-Account? */
async function ownElement(client) {
  if (!client.person) await client.call('getLatestImportTime'); // erzwingt Login → person
  const { id, type, klasseId } = client.person ?? {};
  // 2 = Lehrer, 5 = Schüler. Eltern-/Sonderkonten fallen auf die Klasse zurück.
  if ((type === 2 || type === 5) && id) return { id, type };
  if (klasseId) return { id: klasseId, type: 1 };
  throw new UntisError('forbidden', 'Für dieses Untis-Konto ist kein eigener Stundenplan verfügbar.');
}

const liveSource = {
  mode: 'live',

  /** Prüft Zugangsdaten durch einen echten Login (wird beim Verknüpfen aufgerufen). */
  async verify({ server, school, username, password }) {
    const client = new UntisClient({ server, school, username, password });
    try {
      const person = await client.login();
      return { personType: person.type };
    } finally {
      await client.logout();
    }
  },

  async getTimegrid(link) {
    const units = await clientFor(link).call('getTimegridUnits');
    const grid = {};
    for (const day of units ?? []) {
      // Untis: 1 = Sonntag … 7 = Samstag → ISO: 1 = Montag … 7 = Sonntag
      const iso = day.day === 1 ? 7 : day.day - 1;
      grid[iso] = (day.timeUnits ?? []).map((u) => ({
        name: u.name,
        start: untisTime(u.startTime),
        end: untisTime(u.endTime),
        startMin: toMin(u.startTime),
        endMin: toMin(u.endTime),
      }));
    }
    return grid;
  },

  async getTimetable(link, from, to) {
    const client = clientFor(link);
    const element = await ownElement(client);
    const fields = ['id', 'name', 'longname'];
    const raw = await client.call('getTimetable', {
      options: {
        element,
        startDate: isoToUntis(from),
        endDate: isoToUntis(to),
        showInfo: true,
        showSubstText: true,
        showLsText: true,
        klasseFields: fields,
        teacherFields: fields,
        subjectFields: fields,
        roomFields: fields,
      },
    });
    return (raw ?? []).map(normalizeLesson);
  },
};

// ─── Öffentliche API ───────────────────────────────────────────────────────

const source = () => (config.untis.mock ? mockSource : liveSource);

export const untisService = {
  get mode() {
    return source().mode;
  },
  verify: (credentials) => source().verify(credentials),
  getTimegrid: (link) => source().getTimegrid(link),
  async getTimetable(link, from, to) {
    const lessons = await source().getTimetable(link, from, to);
    return lessons.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  },
  /** Beim Entknüpfen/Neuverknüpfen: zwischengespeicherte Session verwerfen. */
  forget(userId) {
    const cached = clients.get(userId);
    clients.delete(userId);
    cached?.client.logout();
  },
};
