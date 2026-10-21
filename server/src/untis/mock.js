/**
 * Demo-Schule (UNTIS_MOCK=true) – portiert aus UntisDashboard/src/lib/untis/mock.ts.
 * Alles wird aus festen Seeds erzeugt: gleiches Datum → gleicher Stundenplan, gleiche Vertretungen.
 * Der Demo-User ist Schüler der Klasse 3AHIT.
 */
import { deriveSubstitutions } from './status.js';
import { addDays, daysBetween, isoWeekday, parseTime } from './time.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rnd) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PERIODS = [
  ['08:00', '08:50'], ['08:50', '09:40'], ['09:55', '10:45'], ['10:45', '11:35'], ['11:45', '12:35'],
  ['12:35', '13:25'], ['13:30', '14:20'], ['14:20', '15:10'], ['15:20', '16:10'], ['16:10', '17:00'],
];

const TIME_UNITS = PERIODS.map(([start, end], i) => ({
  name: String(i + 1),
  start,
  end,
  startMin: parseTime(start),
  endMin: parseTime(end),
}));

const SUBJECTS = [
  { name: 'D', longName: 'Deutsch', room: 'class' },
  { name: 'E', longName: 'Englisch', room: 'class' },
  { name: 'AM', longName: 'Angewandte Mathematik', room: 'class' },
  { name: 'GGP', longName: 'Geografie, Geschichte und Politische Bildung', room: 'class' },
  { name: 'RK', longName: 'Religion', room: 'class' },
  { name: 'BESP', longName: 'Bewegung und Sport', room: 'gym' },
  { name: 'NW', longName: 'Naturwissenschaften', room: 'lab' },
  { name: 'SEW', longName: 'Softwareentwicklung', room: 'edv' },
  { name: 'INSY', longName: 'Informationssysteme', room: 'edv' },
  { name: 'ITP', longName: 'Informationstechnische Projekte', room: 'edv' },
  { name: 'NWT', longName: 'Netzwerktechnik', room: 'edv' },
  { name: 'ET', longName: 'Elektrotechnik', room: 'class' },
  { name: 'ELO', longName: 'Elektronik', room: 'lab' },
  { name: 'WE', longName: 'Werkstätte', room: 'workshop' },
  { name: 'MT', longName: 'Mechanik und Konstruktion', room: 'class' },
  { name: 'WIR', longName: 'Wirtschaft und Recht', room: 'class' },
];

const CURRICULUM = {
  HIT: ['D', 'E', 'AM', 'GGP', 'RK', 'BESP', 'NW', 'SEW', 'SEW', 'INSY', 'ITP', 'NWT', 'WIR'],
  HEL: ['D', 'E', 'AM', 'GGP', 'RK', 'BESP', 'NW', 'ET', 'ET', 'ELO', 'ELO', 'WE', 'WIR'],
  HME: ['D', 'E', 'AM', 'GGP', 'RK', 'BESP', 'NW', 'MT', 'MT', 'WE', 'WE', 'ET', 'WIR'],
};

const CLASS_NAMES = [
  '1AHIT', '1BHIT', '2AHIT', '2BHIT', '3AHIT', '3BHIT', '4AHIT', '5AHIT',
  '1AHEL', '2AHEL', '3AHEL', '4AHEL', '5AHEL', '1AHME', '2AHME', '3AHME',
];

const ROOMS = [
  ...Array.from({ length: 9 }, (_, i) => ({ name: `E${101 + i}`, longName: `Klassenraum E${101 + i}`, kind: 'class', building: 'Haus A' })),
  ...Array.from({ length: 9 }, (_, i) => ({ name: `O${201 + i}`, longName: `Klassenraum O${201 + i}`, kind: 'class', building: 'Haus A' })),
  { name: 'EDV1', longName: 'EDV-Saal 1', kind: 'edv', building: 'Haus B' },
  { name: 'EDV2', longName: 'EDV-Saal 2', kind: 'edv', building: 'Haus B' },
  { name: 'EDV3', longName: 'EDV-Saal 3', kind: 'edv', building: 'Haus B' },
  { name: 'EDV4', longName: 'EDV-Saal 4', kind: 'edv', building: 'Haus B' },
  { name: 'LAB1', longName: 'Physiklabor', kind: 'lab', building: 'Haus B' },
  { name: 'LAB2', longName: 'Elektroniklabor', kind: 'lab', building: 'Haus B' },
  { name: 'LAB3', longName: 'Chemielabor', kind: 'lab', building: 'Haus B' },
  { name: 'WS1', longName: 'Werkstätte Metall', kind: 'workshop', building: 'Werkstättentrakt' },
  { name: 'WS2', longName: 'Werkstätte Elektro', kind: 'workshop', building: 'Werkstättentrakt' },
  { name: 'TS1', longName: 'Turnsaal 1', kind: 'gym', building: 'Sporthalle' },
  { name: 'TS2', longName: 'Turnsaal 2', kind: 'gym', building: 'Sporthalle' },
];

const TEACHERS = [
  ['HUB', 'Huber', 'Maria', ['D', 'GGP']], ['GRU', 'Gruber', 'Thomas', ['AM', 'NW']],
  ['WAG', 'Wagner', 'Sabine', ['E', 'D']], ['BAU', 'Bauer', 'Michael', ['SEW', 'INSY']],
  ['PIC', 'Pichler', 'Andrea', ['E', 'GGP']], ['STE', 'Steiner', 'Lukas', ['SEW', 'ITP']],
  ['MOS', 'Moser', 'Claudia', ['AM', 'WIR']], ['MAY', 'Mayer', 'Florian', ['NWT', 'ITP']],
  ['HOF', 'Hofer', 'Julia', ['D', 'RK']], ['LEI', 'Leitner', 'Stefan', ['BESP', 'NW']],
  ['BER', 'Berger', 'Katharina', ['E', 'WIR']], ['FU', 'Fuchs', 'Daniel', ['ET', 'ELO']],
  ['ED', 'Eder', 'Martina', ['AM', 'ET']], ['FIS', 'Fischer', 'Markus', ['WE', 'MT']],
  ['SMI', 'Schmid', 'Elisabeth', ['GGP', 'D']], ['WIN', 'Winkler', 'Patrick', ['INSY', 'SEW']],
  ['WEB', 'Weber', 'Birgit', ['NW', 'AM']], ['SWZ', 'Schwarz', 'Alexander', ['ELO', 'WE']],
  ['MAI', 'Maier', 'Christina', ['E', 'RK']], ['REI', 'Reiter', 'Bernhard', ['BESP']],
  ['SUS', 'Schuster', 'Verena', ['D', 'E']], ['LA', 'Lang', 'Wolfgang', ['MT', 'AM']],
  ['BGT', 'Baumgartner', 'Lisa', ['ITP', 'NWT']], ['WO', 'Wolf', 'Georg', ['WE', 'ET']],
  ['BRU', 'Brunner', 'Eva', ['WIR', 'GGP']], ['AU', 'Auer', 'Johannes', ['SEW', 'NWT']],
  ['WIM', 'Wimmer', 'Sandra', ['AM', 'NW']], ['EGG', 'Egger', 'Martin', ['ELO', 'ET']],
  ['AIG', 'Aigner', 'Barbara', ['BESP', 'RK']], ['LEC', 'Lechner', 'Peter', ['MT', 'WE']],
  ['HAA', 'Haas', 'Monika', ['D', 'GGP']], ['KOL', 'Koller', 'Andreas', ['INSY', 'ITP']],
  ['STR', 'Strasser', 'Nina', ['E', 'AM']], ['HOL', 'Holzer', 'Robert', ['SEW', 'AM']],
];

const subjects = SUBJECTS.map((s, i) => ({ id: 300 + i, type: 'subject', name: s.name, longName: s.longName }));
const classes = CLASS_NAMES.map((name, i) => ({
  id: 100 + i,
  type: 'class',
  name,
  longName: `${name.slice(0, 1)}. Jahrgang ${name.slice(2)}`,
}));
const rooms = ROOMS.map((r, i) => ({ id: 400 + i, type: 'room', name: r.name, longName: r.longName, building: r.building }));
const teachers = TEACHERS.map(([abbr, last, first], i) => ({ id: 200 + i, type: 'teacher', name: abbr, longName: `${last} ${first}` }));

/** Klasse des Demo-Users */
const DEMO_CLASS_ID = classes.find((c) => c.name === '3AHIT').id;

const ref = (e) => ({ id: e.id, name: e.name, longName: e.longName });
const subjectByName = new Map(SUBJECTS.map((s, i) => [s.name, { ...s, el: subjects[i] }]));
const teachersBySubject = new Map();
TEACHERS.forEach(([, , , subs], i) => {
  for (const s of subs) teachersBySubject.set(s, [...(teachersBySubject.get(s) ?? []), i]);
});

/** Wochen-Grundplan, einmal pro Wochentag erzeugt. */
function buildWeekday(weekday) {
  const rnd = mulberry32(4711 + weekday * 97);
  const busyTeachers = PERIODS.map(() => new Set());
  const busyRooms = PERIODS.map(() => new Set());
  const plan = [];

  for (const classIdx of shuffle(CLASS_NAMES.map((_, i) => i), rnd)) {
    const curriculum = CURRICULUM[CLASS_NAMES[classIdx].slice(2)];
    const firstPeriod = rnd() < 0.15 ? 1 : 0;
    const lastPeriod = Math.min(PERIODS.length, 5 + Math.floor(rnd() * 5));
    const gap = rnd() < 0.3 ? 5 : -1; // optionale Mittagspause in der 6. Stunde

    let p = firstPeriod;
    while (p < lastPeriod) {
      if (p === gap) {
        p++;
        continue;
      }
      const subject = curriculum[Math.floor(rnd() * curriculum.length)];
      const kind = subjectByName.get(subject).room;
      const length = kind === 'class' && rnd() < 0.6 ? 1 : 2;
      const span = Array.from({ length }, (_, k) => p + k).filter((x) => x < lastPeriod);

      const teacherIdx = shuffle(teachersBySubject.get(subject) ?? [], rnd).find((t) => span.every((x) => !busyTeachers[x].has(t)));
      const roomCandidates =
        kind === 'class'
          ? [classIdx] // Klassen 0..15 haben ihren Stammraum E101…O207
          : shuffle(ROOMS.map((r, i) => (r.kind === kind ? i : -1)).filter((i) => i >= 0), rnd);
      const roomIdx = roomCandidates.find((r) => span.every((x) => !busyRooms[x].has(r)));

      if (teacherIdx === undefined || roomIdx === undefined) {
        p++; // keine freie Lehrkraft/kein Raum → Freistunde
        continue;
      }
      for (const x of span) {
        busyTeachers[x].add(teacherIdx);
        busyRooms[x].add(roomIdx);
        plan.push({ classIdx, period: x, subject, teacherIdx, roomIdx });
      }
      p += span.length;
    }
  }
  return plan;
}

const weekPlan = new Map();
const dayCache = new Map();

function lessonsForDate(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  const weekday = isoWeekday(date);
  if (weekday > 5) return [];
  if (!weekPlan.has(weekday)) weekPlan.set(weekday, buildWeekday(weekday));
  const plan = weekPlan.get(weekday);

  const dateNum = Number(date.replaceAll('-', ''));
  const rnd = mulberry32(dateNum);
  const busyTeachers = PERIODS.map(() => new Set());
  const busyRooms = PERIODS.map(() => new Set());
  for (const l of plan) {
    busyTeachers[l.period].add(l.teacherIdx);
    busyRooms[l.period].add(l.roomIdx);
  }

  // Änderungen pro Block (Klasse/Fach/Lehrkraft), damit Doppelstunden gemeinsam geändert werden
  const decisions = new Map();

  const lessons = plan.map((l, index) => {
    const unit = TIME_UNITS[l.period];
    const blockKey = `${l.classIdx}-${l.subject}-${l.teacherIdx}`;
    let d = decisions.get(blockKey);
    if (!d) {
      const r = rnd();
      d = { kind: r < 0.04 ? 1 : r < 0.1 ? 2 : r < 0.13 ? 3 : 0 }; // 1 Entfall, 2 Vertretung, 3 Raumänderung
      decisions.set(blockKey, d);
    }

    let teacherIdx = l.teacherIdx;
    let roomIdx = l.roomIdx;
    let teacherChanged = false;
    let roomChanged = false;

    if (d.kind === 2) {
      d.teacher ??= shuffle(TEACHERS.map((_, i) => i), rnd).find((t) => !busyTeachers[l.period].has(t));
      if (d.teacher !== undefined && !busyTeachers[l.period].has(d.teacher)) {
        busyTeachers[l.period].add(d.teacher);
        teacherIdx = d.teacher;
        teacherChanged = true;
      }
    } else if (d.kind === 3) {
      const kind = ROOMS[l.roomIdx].kind;
      d.room ??= shuffle(ROOMS.map((r, i) => (r.kind === kind ? i : -1)).filter((i) => i >= 0), rnd).find((r) => !busyRooms[l.period].has(r));
      if (d.room !== undefined && !busyRooms[l.period].has(d.room)) {
        busyRooms[l.period].add(d.room);
        roomIdx = d.room;
        roomChanged = true;
      }
    }

    const subject = subjectByName.get(l.subject);
    const teacherRef = ref(teachers[teacherIdx]);
    const roomRef = ref(rooms[roomIdx]);
    if (teacherChanged) teacherRef.original = { id: teachers[l.teacherIdx].id, name: teachers[l.teacherIdx].name };
    if (roomChanged) roomRef.original = { id: rooms[l.roomIdx].id, name: rooms[l.roomIdx].name };

    return {
      id: dateNum * 1000 + index,
      date,
      start: unit.start,
      end: unit.end,
      startMin: unit.startMin,
      endMin: unit.endMin,
      classes: [ref(classes[l.classIdx])],
      teachers: [teacherRef],
      subjects: [ref(subject.el)],
      rooms: [roomRef],
      status: d.kind === 1 ? 'cancelled' : teacherChanged || roomChanged ? 'irregular' : 'regular',
      lessonType: 'ls',
      substText:
        d.kind === 1 ? 'Entfall – Lehrkraft verhindert' : teacherChanged ? 'Vertretung' : roomChanged ? 'Raumänderung' : undefined,
      teacherChanged,
      roomChanged,
    };
  });

  lessons.sort((a, b) => a.startMin - b.startMin || a.classes[0].name.localeCompare(b.classes[0].name));
  dayCache.set(date, lessons);
  return lessons;
}

function matches(lesson, type, id) {
  const list = { teacher: lesson.teachers, class: lesson.classes, room: lesson.rooms, subject: lesson.subjects }[type] ?? [];
  return list.some((e) => e.id === id);
}

function* dateRange(from, to) {
  const n = Math.min(daysBetween(from, to), 62);
  for (let i = 0; i <= n; i++) yield addDays(from, i);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockUntisSource {
  mode = 'demo';

  async verify() {
    await delay(200);
    return { personType: 5 };
  }

  getTeachers = async () => teachers;
  getClasses = async () => classes;
  getRooms = async () => rooms;
  getSubjects = async () => subjects;
  getTimegrid = async () => ({ 1: TIME_UNITS, 2: TIME_UNITS, 3: TIME_UNITS, 4: TIME_UNITS, 5: TIME_UNITS });
  getOwnElement = async () => ({ type: 'class', id: DEMO_CLASS_ID });

  async getTimetable(type, id, from, to) {
    await delay(20);
    const t = type === 'student' ? 'class' : type;
    const result = [];
    for (const date of dateRange(from, to)) result.push(...lessonsForDate(date).filter((l) => matches(l, t, id)));
    return result;
  }

  /** Demo-Prüfungen: an festen Wochentagen alle zwei Wochen eine Schularbeit bzw. ein Test. */
  async getExams(klasseId, from, to) {
    const cls = classes.find((c) => c.id === klasseId);
    const exams = [];
    for (const date of dateRange(from, to)) {
      const dayNum = Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
      const lesson = lessonsForDate(date).find(
        (l) => l.classes[0].id === klasseId && l.status !== 'cancelled' && ['AM', 'D', 'E', 'SEW', 'NWT', 'INSY'].includes(l.subjects[0].name),
      );
      if (!lesson || (dayNum + klasseId) % 6 !== 0) continue;
      const big = ['AM', 'D', 'E'].includes(lesson.subjects[0].name);
      exams.push({
        id: `demo-${date}-${lesson.id}`,
        date,
        start: lesson.start,
        end: lesson.end,
        subject: lesson.subjects[0].name,
        subjectLong: lesson.subjects[0].longName,
        name: big ? `${lesson.subjects[0].longName} Schularbeit` : `${lesson.subjects[0].name}-Test`,
        type: big ? 'Schularbeit' : 'Test',
        text: big ? 'Stoff: alles seit der letzten Schularbeit' : `Klasse ${cls?.name}`,
        teachers: lesson.teachers.map((t) => t.name),
        rooms: lesson.rooms.map((r) => r.name),
      });
    }
    return exams;
  }

  async getSubstitutions(from, to) {
    await delay(50);
    return deriveSubstitutions([...dateRange(from, to)].flatMap(lessonsForDate));
  }

  logout = async () => {};
}
