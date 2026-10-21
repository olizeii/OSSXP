/**
 * Live-Datenquelle: echtes WebUntis per JSON-RPC (aus UntisDashboard/source.ts portiert).
 * Normalisiert die Rohdaten in Lesson / Substitution / Element-Objekte.
 */
import { createCache, mapLimit } from './cache.js';
import { UntisClient } from './client.js';
import { UntisError, toUntisError } from './errors.js';
import { formatMinutes, isoToUntisDate, startOfWeek, untisDateToIso, untisTimeToMinutes } from './time.js';

/** WebUntis-Elementtypen für getTimetable */
export const ELEMENT_TYPE_ID = { class: 1, teacher: 2, subject: 3, room: 4 };

const MAX_CONCURRENCY = 4;
const REF_FIELDS = ['id', 'name', 'longname', 'externalkey'];
const KNOWN_SUBST_TYPES = new Set(['cancel', 'subst', 'add', 'shift', 'rmchg', 'rmlk', 'bs', 'free', 'exam']);

// ─── Mapping ───────────────────────────────────────────────────────────────

const mapRef = (r) => ({
  id: r.id,
  name: r.name ?? '?',
  longName: r.longname || undefined,
  original: r.orgid || r.orgname ? { id: r.orgid, name: r.orgname ?? '?' } : undefined,
});

export function mapPeriod(p) {
  const startMin = untisTimeToMinutes(p.startTime);
  const endMin = untisTimeToMinutes(p.endTime);
  const teachers = (p.te ?? []).map(mapRef);
  const rooms = (p.ro ?? []).map(mapRef);
  return {
    id: p.id,
    date: untisDateToIso(p.date),
    start: formatMinutes(startMin),
    end: formatMinutes(endMin),
    startMin,
    endMin,
    classes: (p.kl ?? []).map(mapRef),
    teachers,
    subjects: (p.su ?? []).map(mapRef),
    rooms,
    status: p.code ?? 'regular',
    lessonType: p.lstype,
    text: p.lstext || undefined,
    substText: p.substText || undefined,
    info: p.info || undefined,
    studentGroup: p.sg || undefined,
    teacherChanged: teachers.some((t) => t.original),
    roomChanged: rooms.some((r) => r.original),
  };
}

function mapSubstitution(s) {
  const startMin = untisTimeToMinutes(s.startTime);
  const endMin = untisTimeToMinutes(s.endTime);
  const type = KNOWN_SUBST_TYPES.has(s.type) ? s.type : 'other';
  return {
    id: `${s.lsid}-${s.date}-${s.startTime}-${type}`,
    type,
    date: untisDateToIso(s.date),
    start: formatMinutes(startMin),
    end: formatMinutes(endMin),
    startMin,
    endMin,
    classes: (s.kl ?? []).map(mapRef),
    teachers: (s.te ?? []).map(mapRef),
    subjects: (s.su ?? []).map(mapRef),
    rooms: (s.ro ?? []).map(mapRef),
    text: s.txt || undefined,
  };
}

function mapElements(type, raw) {
  return (raw ?? [])
    .filter((e) => e.active !== false)
    .map((e) => ({
      id: e.id,
      type,
      name: e.name,
      longName:
        type === 'teacher'
          ? [e.longName, e.foreName].filter(Boolean).join(' ') || undefined
          : e.longName || undefined,
      building: e.building || undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// ─── Wochenansicht (/api/public/timetable/weekly/data) ─────────────────────

const WEEKLY_TEACHER_TYPE = 2;
const WEEKLY_SUBJECT_TYPE = 3;

function mapWeeklyTeachers(res) {
  if (res?.data?.error) {
    throw new UntisError('untis', `Wochenansicht: ${res.data.error.message ?? 'Fehler'}`, res.data.error.code);
  }
  const data = res?.data?.result?.data;
  const names = new Map();
  for (const e of data?.elements ?? []) {
    if (e.type === WEEKLY_TEACHER_TYPE) names.set(e.id, { name: e.name || e.displayname, longName: e.longName || undefined });
  }

  const result = {
    periods: 0,
    teachers: [...names].filter(([, t]) => t.name).map(([id, t]) => ({ id, type: 'teacher', name: t.name, longName: t.longName })),
    byId: new Map(),
    bySlot: new Map(),
  };
  for (const periods of Object.values(data?.elementPeriods ?? {})) {
    for (const p of periods) {
      result.periods++;
      const teachers = [];
      for (const e of p.elements ?? []) {
        if (e.type !== WEEKLY_TEACHER_TYPE) continue;
        const current = names.get(e.id);
        if (!current?.name) continue; // für diesen Account ausgeblendet
        const changed = e.orgId && e.orgId !== e.id;
        teachers.push({
          id: e.id,
          name: current.name,
          longName: current.longName,
          original: changed ? { id: e.orgId, name: names.get(e.orgId)?.name ?? '?' } : undefined,
        });
      }
      if (teachers.length === 0) continue;
      const subject = (p.elements ?? []).find((e) => e.type === WEEKLY_SUBJECT_TYPE)?.id ?? 0;
      result.byId.set(p.id, teachers);
      result.bySlot.set(`${untisDateToIso(p.date)}|${untisTimeToMinutes(p.startTime)}|${subject}`, teachers);
    }
  }
  return result;
}

// ─── Quelle ────────────────────────────────────────────────────────────────

export class LiveUntisSource {
  mode = 'live';
  #weeklyUnavailable = new Set();
  #cache = createCache();

  /** @param {{ server, school, username, password }} credentials */
  constructor(credentials) {
    this.client = new UntisClient(credentials);
  }

  /** Prüft Zugangsdaten (Login + Logout). */
  async verify() {
    const person = await this.client.login();
    await this.client.logout();
    return { personType: person.type };
  }

  getTeachers = async () => mapElements('teacher', await this.client.call('getTeachers'));
  getClasses = async () => mapElements('class', await this.client.call('getKlassen'));
  getRooms = async () => mapElements('room', await this.client.call('getRooms'));
  getSubjects = async () => mapElements('subject', await this.client.call('getSubjects'));

  async getTimegrid() {
    const raw = await this.client.call('getTimegridUnits');
    const grid = {};
    for (const day of raw ?? []) {
      // Untis: 1 = Sonntag … 7 = Samstag → ISO: 1 = Montag … 7 = Sonntag
      const iso = day.day === 1 ? 7 : day.day - 1;
      grid[iso] = (day.timeUnits ?? []).map((u) => {
        const startMin = untisTimeToMinutes(u.startTime);
        const endMin = untisTimeToMinutes(u.endTime);
        return { name: u.name, start: formatMinutes(startMin), end: formatMinutes(endMin), startMin, endMin };
      });
    }
    return grid;
  }

  /** Element des eingeloggten Accounts (eigener Stundenplan). */
  async getOwnElement() {
    if (!this.client.person) await this.client.call('getLatestImportTime'); // erzwingt Login
    const { id, type, klasseId } = this.client.person ?? {};
    if (type === 2 && id) return { type: 'teacher', id };
    if (type === 5 && id) return { type: 'student', id, klasseId };
    if (klasseId) return { type: 'class', id: klasseId };
    throw new UntisError('forbidden', 'Für dieses Untis-Konto ist kein eigener Stundenplan verfügbar.');
  }

  async #rpcTimetable(type, id, from, to) {
    const raw = await this.client.call('getTimetable', {
      options: {
        element: { id, type: type === 'student' ? 5 : ELEMENT_TYPE_ID[type] },
        startDate: isoToUntisDate(from),
        endDate: isoToUntisDate(to),
        showLsText: true,
        showStudentgroup: true,
        showSubstText: true,
        showInfo: true,
        klasseFields: REF_FIELDS,
        teacherFields: REF_FIELDS,
        subjectFields: REF_FIELDS,
        roomFields: REF_FIELDS,
      },
    });
    return (raw ?? []).map(mapPeriod).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  }

  /** Stundenplan eines Elements (type: class | teacher | room | subject | student). */
  async getTimetable(type, id, from, to) {
    const lessons = await this.#rpcTimetable(type, id, from, to);
    // Schüler-Accounts bekommen per JSON-RPC oft keine Lehrkräfte – die Wochenansicht schon.
    const weeklyType = type === 'student' ? 'class' : type;
    if (
      lessons.length > 0 &&
      lessons.every((l) => l.teachers.length === 0) &&
      type !== 'student' &&
      !this.#weeklyUnavailable.has(weeklyType)
    ) {
      await this.#fillTeachersFromWeekly(weeklyType, id, lessons);
    }
    return lessons;
  }

  #weeklyTeachers(type, id, monday) {
    return this.#cache.cached(`weekly:${type}:${id}:${monday}`, 5 * 60_000, async () =>
      mapWeeklyTeachers(
        await this.client.getJson('api/public/timetable/weekly/data', {
          elementType: String(ELEMENT_TYPE_ID[type]),
          elementId: String(id),
          date: monday,
          formatId: '1',
        }),
      ),
    );
  }

  async #fillTeachersFromWeekly(type, id, lessons) {
    const mondays = [...new Set(lessons.map((l) => startOfWeek(l.date)))];
    try {
      const maps = await Promise.all(mondays.map((m) => this.#weeklyTeachers(type, id, m)));
      for (const lesson of lessons) {
        const slot = `${lesson.date}|${lesson.startMin}|${lesson.subjects[0]?.id ?? 0}`;
        const teachers = maps.map((m) => m.byId.get(lesson.id) ?? m.bySlot.get(slot)).find((t) => t?.length);
        if (teachers) {
          lesson.teachers = teachers;
          lesson.teacherChanged = teachers.some((t) => t.original);
        }
      }
    } catch (err) {
      this.#weeklyUnavailable.add(type);
      console.warn(`[untis] Wochenansicht nicht verfügbar – Lehrkräfte bleiben leer: ${toUntisError(err).message}`);
    }
  }

  /** Lehrerliste aus den Wochenansichten aller Klassen (wenn getTeachers leer ist). */
  async listTeachersFromWeekly(classIds, monday) {
    const results = await mapLimit(classIds, MAX_CONCURRENCY, (id) => this.#weeklyTeachers('class', id, monday));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0 && failures.length === results.length) throw failures[0].reason;
    const byId = new Map();
    for (const r of results) if (r.status === 'fulfilled') for (const t of r.value.teachers) byId.set(t.id, t);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }

  async getSubstitutions(from, to) {
    const raw = await this.client.call('getSubstitutions', {
      startDate: isoToUntisDate(from),
      endDate: isoToUntisDate(to),
      departmentId: 0,
    });
    return (raw ?? []).map(mapSubstitution);
  }

  /**
   * Prüfungen einer Klasse über die Web-API (GET /WebUntis/api/exams), wie sie auch die
   * offizielle WebUntis-Oberfläche benutzt. Antwortformat: { data: { exams: [...] } }.
   */
  async getExams(klasseId, from, to) {
    const res = await this.client.getJson('api/exams', {
      startDate: String(isoToUntisDate(from)),
      endDate: String(isoToUntisDate(to)),
      klasseId: String(klasseId),
      withGrades: 'true',
    });
    const exams = res?.data?.exams ?? res?.exams ?? [];
    return exams.map((e) => ({
      id: String(e.id),
      date: untisDateToIso(e.examDate),
      start: formatMinutes(untisTimeToMinutes(e.startTime)),
      end: formatMinutes(untisTimeToMinutes(e.endTime)),
      subject: e.subject ?? '',
      name: e.name || e.examType || 'Prüfung',
      type: e.examType || undefined,
      text: e.text || undefined,
      teachers: e.teachers ?? [],
      rooms: e.rooms ?? [],
    }));
  }

  logout = () => this.client.logout();
}

export { MAX_CONCURRENCY };
