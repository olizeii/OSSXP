/**
 * Untis-Service – die Logik von UntisDashboard (src/lib/untis/service.ts), aber pro OSSXP-User:
 * Jeder verknüpfte Account hat eine eigene Datenquelle, einen eigenen Cache und eigene Rechte.
 *
 *  - Stammdaten (Lehrkräfte, Klassen, Räume, Fächer, Zeitraster) – mit Fallbacks für Schüler-Accounts
 *  - Tagesansicht der ganzen Schule (aus allen Klassen-Stundenplänen zusammengesetzt)
 *  - Live-Status „Wo ist Lehrkraft/Klasse/Raum gerade?“
 *  - Freie Räume, Vertretungsplan, Dashboard-Kennzahlen
 */
import { config } from '../config.js';
import { createCache, mapLimit } from './cache.js';
import { decrypt } from './crypto.js';
import { UntisError, isPermissionError, toUntisError } from './errors.js';
import { MockUntisSource } from './mock.js';
import { LiveUntisSource, MAX_CONCURRENCY } from './source-live.js';
import { computeStatus, deriveSubstitutions } from './status.js';
import { addDays, isIsoDate, isoWeekday, parseTime, startOfWeek, zonedNow } from './time.js';

const MINUTE = 60_000;
const TTL = {
  master: 6 * 60 * MINUTE,
  today: 2 * MINUTE,
  otherDay: 15 * MINUTE,
  substitutions: 3 * MINUTE,
};

/**
 * Akzeptiert sowohl "nessa.webuntis.com" als auch komplette URLs wie
 * "https://nessa.webuntis.com/WebUntis/?school=abc-schule#/basic/login" und liefert { server, school? }.
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

// ─── Zeitpunkt („jetzt“ oder gewähltes Datum/Uhrzeit, in Schulzeit) ────────

const schoolNow = () => zonedNow(config.untis.timezone);

export function resolveMoment(date, time) {
  const now = schoolNow();
  const targetDate = isIsoDate(date) ? date : now.date;
  const parsed = time ? parseTime(time) : NaN;
  if (!Number.isNaN(parsed)) return { date: targetDate, atMin: parsed, live: false, today: now.date };
  return { date: targetDate, atMin: now.minutes, live: targetDate === now.date, today: now.date };
}

const dayTtl = (date) => (date === schoolNow().date ? TTL.today : TTL.otherDay);

// ─── Kontext pro User ──────────────────────────────────────────────────────

const mockSource = new MockUntisSource();
const contexts = new Map(); // userId → { fingerprint, source, cache, denied }

function contextFor(link) {
  const fingerprint = `${link.server}|${link.school}|${link.username}|${link.updated_at}`;
  const existing = contexts.get(link.user_id);
  if (existing?.fingerprint === fingerprint) return existing;
  existing?.source.logout?.();

  const source = config.untis.mock
    ? mockSource
    : new LiveUntisSource({ server: link.server, school: link.school, username: link.username, password: decrypt(link.secret_enc) });
  const ctx = { fingerprint, source, cache: createCache(), denied: new Set() };
  contexts.set(link.user_id, ctx);
  return ctx;
}

const refsOf = (lesson, type) => ({ teacher: lesson.teachers, class: lesson.classes, room: lesson.rooms, subject: lesson.subjects })[type] ?? [];

function deriveElements(type, lessons) {
  const map = new Map();
  for (const lesson of lessons) {
    for (const r of type === 'teacher' ? lesson.teachers : lesson.rooms) {
      if (r.id && !map.has(r.id)) map.set(r.id, { id: r.id, type, name: r.name, longName: r.longName });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Alle Untis-Abfragen eines verknüpften Users. */
export function untisFor(link) {
  const { source, cache, denied } = contextFor(link);
  const { cached } = cache;

  // ── Stammdaten ──
  async function loadMasterData() {
    const settle = (p) => p.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));
    const [classes, subjects, timegrid, teachersResult, roomsResult] = await Promise.all([
      source.getClasses(),
      source.getSubjects().catch(() => []),
      source.getTimegrid().catch(() => ({})),
      settle(source.getTeachers()),
      settle(source.getRooms()),
    ]);
    for (const r of [teachersResult, roomsResult]) if (!r.ok && !isPermissionError(r.error)) throw r.error;

    // Manche Accounts bekommen einen Rechtefehler, andere einfach eine leere Liste
    let teachers = teachersResult.ok ? teachersResult.value : [];
    let rooms = roomsResult.ok ? roomsResult.value : [];
    let teacherSource = 'api';
    const monday = startOfWeek(resolveMoment().date);

    if (teachers.length === 0 && source.listTeachersFromWeekly) {
      try {
        teachers = await source.listTeachersFromWeekly(classes.map((c) => c.id), monday);
        teacherSource = 'derived';
      } catch (err) {
        console.warn(`[untis] Lehrerliste aus Wochenansicht nicht möglich: ${toUntisError(err).message}`);
      }
    }
    if (teachers.length === 0 || rooms.length === 0) {
      // Fehlende Stammdaten aus den Klassen-Stundenplänen dieser Woche rekonstruieren
      const week = (await Promise.all([0, 1, 2, 3, 4].map((i) => aggregateDay(addDays(monday, i), classes)))).flat();
      if (teachers.length === 0) {
        teachers = deriveElements('teacher', week);
        teacherSource = 'derived';
      }
      if (rooms.length === 0) rooms = deriveElements('room', week);
    }
    return { teachers, classes, rooms, subjects, timegrid, teacherSource };
  }

  const masterData = () => cached('master', TTL.master, loadMasterData);

  /** Lehrer-Langnamen aus den Stammdaten in Stunden/Vertretungen übernehmen. */
  async function withTeacherNames(items) {
    const byId = new Map((await masterData()).teachers.map((t) => [t.id, t]));
    for (const item of items) {
      for (const r of item.teachers) {
        const longName = byId.get(r.id)?.longName;
        if (longName && (!r.longName || r.longName === r.name)) r.longName = longName;
      }
    }
    return items;
  }

  async function findElement(type, id) {
    const master = await masterData();
    const list = { teacher: master.teachers, class: master.classes, room: master.rooms, subject: master.subjects }[type] ?? [];
    const element = list.find((e) => e.id === id);
    if (!element) throw new UntisError('not-found', 'Das gesuchte Element wurde nicht gefunden.');
    return element;
  }

  // ── Stundenpläne ──
  const classTimetable = (id, date) => cached(`tt:class:${id}:${date}`, dayTtl(date), () => source.getTimetable('class', id, date, date));

  /** Alle Stunden eines Tages, aus allen Klassen zusammengesetzt (ohne Duplikate). */
  function aggregateDay(date, classes) {
    return cached(`day:${date}`, dayTtl(date), async () => {
      const results = await mapLimit(classes, MAX_CONCURRENCY, (c) => classTimetable(c.id, date));
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0 && failures.length === results.length) throw failures[0].reason;
      const byId = new Map();
      for (const r of results) if (r.status === 'fulfilled') for (const l of r.value) if (!byId.has(l.id)) byId.set(l.id, l);
      return [...byId.values()].sort((a, b) => a.startMin - b.startMin);
    });
  }

  async function dayLessons(date) {
    const master = await masterData();
    return withTeacherNames(await aggregateDay(date, master.classes));
  }

  /** Tagesplan eines Elements: erst direkt abfragen, bei fehlenden Rechten aus dem Schultag filtern. */
  async function elementLessons(type, id, date) {
    if (type === 'class') return withTeacherNames(await classTimetable(id, date));
    // Abgeleitete Lehrerliste = Account darf Lehrer nicht direkt abfragen (liefert dann oft leer statt Fehler)
    const skipDirect = type === 'teacher' && (await masterData()).teacherSource === 'derived';
    if (!skipDirect && !denied.has(type)) {
      try {
        const lessons = await cached(`tt:${type}:${id}:${date}`, dayTtl(date), () => source.getTimetable(type, id, date, date));
        return await withTeacherNames(lessons);
      } catch (err) {
        if (!isPermissionError(err)) throw err;
        denied.add(type);
      }
    }
    return (await dayLessons(date)).filter((l) => refsOf(l, type).some((r) => r.id === id));
  }

  async function elementStatus(type, id, moment) {
    const [element, lessons, master] = await Promise.all([findElement(type, id), elementLessons(type, id, moment.date), masterData()]);
    return {
      element,
      date: moment.date,
      atMin: moment.atMin,
      live: moment.live,
      ...computeStatus(lessons, moment.atMin),
      lessons,
      timegrid: master.timegrid[isoWeekday(moment.date)] ?? [],
    };
  }

  // ── Freie Räume ──
  async function freeRooms(moment) {
    const [master, lessons] = await Promise.all([masterData(), dayLessons(moment.date)]);
    const at = moment.atMin;
    const byRoom = new Map();
    for (const l of lessons.filter((x) => x.status !== 'cancelled')) {
      for (const r of l.rooms) byRoom.set(r.id, [...(byRoom.get(r.id) ?? []), l]);
    }

    const free = [];
    const occupied = [];
    for (const room of master.rooms) {
      const roomLessons = (byRoom.get(room.id) ?? []).sort((a, b) => a.startMin - b.startMin);
      const occupiedBy = roomLessons.find((l) => l.startMin <= at && at < l.endMin) ?? null;
      if (occupiedBy) {
        let busyUntil = occupiedBy.endMin;
        for (const l of roomLessons) if (l.startMin >= busyUntil && l.startMin - busyUntil <= 15) busyUntil = Math.max(busyUntil, l.endMin);
        occupied.push({ room, occupiedBy, freeUntilMin: null, busyUntilMin: busyUntil });
      } else {
        const next = roomLessons.find((l) => l.startMin > at);
        free.push({ room, occupiedBy: null, freeUntilMin: next?.startMin ?? null, busyUntilMin: null });
      }
    }
    const byName = (a, b) => a.room.name.localeCompare(b.room.name, 'de', { numeric: true });
    free.sort((a, b) => (b.freeUntilMin ?? 1440) - (a.freeUntilMin ?? 1440) || byName(a, b));
    occupied.sort(byName);
    return { date: moment.date, atMin: at, live: moment.live, free, occupied };
  }

  // ── Vertretungen ──
  async function substitutions(from, to) {
    const result = await cached(`subst:${from}:${to}`, TTL.substitutions, async () => {
      if (!denied.has('substitutions')) {
        try {
          const items = await source.getSubstitutions(from, to);
          items.sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
          return { from, to, items, source: 'api' };
        } catch (err) {
          if (!isPermissionError(err)) throw err;
          denied.add('substitutions');
        }
      }
      // Kein Zugriff auf den offiziellen Plan → aus den Stundenplänen ableiten
      const days = [];
      for (let d = from; d <= to && days.length < 14; d = addDays(d, 1)) if (isoWeekday(d) <= 6) days.push(d);
      const lessons = (await Promise.all(days.map(dayLessons))).flat();
      return { from, to, items: deriveSubstitutions(lessons), source: 'derived' };
    });
    await withTeacherNames(result.items);
    return result;
  }

  // ── Dashboard ──
  async function dashboard(moment) {
    const [master, lessons, subst] = await Promise.all([masterData(), dayLessons(moment.date), substitutions(moment.date, moment.date)]);
    const at = moment.atMin;
    const active = lessons.filter((l) => l.status !== 'cancelled');
    const now = active.filter((l) => l.startMin <= at && at < l.endMin);
    const unique = (refs) => new Set(refs.map((r) => r.id)).size;
    const count = (...types) => subst.items.filter((s) => types.includes(s.type)).length;

    const units = master.timegrid[isoWeekday(moment.date)] ?? [];
    const utilization = units.map((u) => {
      const mid = (u.startMin + u.endMin) / 2;
      const inUnit = active.filter((l) => l.startMin <= mid && mid < l.endMin);
      return {
        name: u.name,
        start: u.start,
        end: u.end,
        startMin: u.startMin,
        endMin: u.endMin,
        lessons: inUnit.length,
        occupiedRooms: unique(inUnit.flatMap((l) => l.rooms)),
        totalRooms: master.rooms.length,
      };
    });

    return {
      date: moment.date,
      atMin: at,
      live: moment.live,
      lessonsToday: active.length,
      cancellations: count('cancel'),
      substitutions: count('subst'),
      roomChanges: count('rmchg', 'rmlk'),
      additional: count('add', 'shift', 'exam'),
      roomsTotal: master.rooms.length,
      roomsOccupiedNow: unique(now.flatMap((l) => l.rooms)),
      teachersInLessonNow: unique(now.flatMap((l) => l.teachers)),
      teachersTotal: master.teachers.length,
      classesInLessonNow: unique(now.flatMap((l) => l.classes)),
      classesTotal: master.classes.length,
      utilization,
      upcomingChanges: subst.items.filter((s) => !moment.live || s.endMin > at).slice(0, 8),
      substitutionSource: subst.source,
    };
  }

  // ── Eigener Stundenplan (Wochenansicht) ──
  async function ownTimetable(from, to) {
    const own = await cached('own', TTL.master, () => source.getOwnElement());
    const lessons = await cached(`own:${from}:${to}`, dayTtl(from), () => source.getTimetable(own.type, own.id, from, to));
    return withTeacherNames(lessons.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin));
  }

  async function timegrid() {
    return (await masterData()).timegrid;
  }

  return { masterData, dayLessons, elementStatus, freeRooms, substitutions, dashboard, ownTimetable, timegrid };
}

export const untisService = {
  get mode() {
    return config.untis.mock ? 'demo' : 'live';
  },
  get timezone() {
    return config.untis.timezone;
  },
  /** Prüft Zugangsdaten durch einen echten Login (beim Verknüpfen). */
  verify: (credentials) => (config.untis.mock ? mockSource.verify() : new LiveUntisSource(credentials).verify()),
  /** Beim Entknüpfen/Neuverknüpfen: Session und Cache verwerfen. */
  forget(userId) {
    const ctx = contexts.get(userId);
    contexts.delete(userId);
    if (ctx && ctx.source !== mockSource) ctx.source.logout?.();
  },
};
