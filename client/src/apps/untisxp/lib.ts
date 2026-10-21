/**
 * Helfer für UntisXP: Zeit/Datum, Live-Status (gleiche Logik wie auf dem Server, damit der
 * Countdown sekundengenau umspringt), Beschriftungen und ein kleiner Daten-Hook.
 */
import { useEffect, useState } from 'react';
import { api } from '../../core/api';
import type { ElementRef, ElementState, ElementType, Lesson, SubstitutionType, TimeUnit, View } from './types';

// ─── Zeit & Datum ──────────────────────────────────────────────────────────

export const formatMinutes = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min) % 60).padStart(2, '0')}`;

export function parseTime(v: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

const toDate = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (iso: string, n: number) => {
  const d = toDate(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
};
export const isoWeekday = (iso: string) => toDate(iso).getDay() || 7;
export const startOfWeek = (iso: string) => addDays(iso, 1 - isoWeekday(iso));

export const formatLongDate = (iso: string) =>
  toDate(iso).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const formatShortDate = (iso: string) =>
  toDate(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** 95 → "1 h 35 min" */
export function formatDuration(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
}

export function formatCountdown(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Datum, Minute und Sekunde „jetzt“ in der Zeitzone der Schule – tickt jede Sekunde. */
export function useSchoolNow(timeZone: string) {
  const compute = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      minutes: Number(parts.hour) * 60 + Number(parts.minute),
      seconds: Number(parts.second),
    };
  };
  const [now, setNow] = useState(compute);
  useEffect(() => {
    setNow(compute());
    const t = setInterval(() => setNow(compute()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);
  return now;
}

// ─── Live-Status (Spiegel von server/src/untis/status.js) ──────────────────

const ids = (refs: ElementRef[]) =>
  refs
    .map((r) => r.id)
    .sort((a, b) => a - b)
    .join(',');

export function continuesBlock(a: Lesson, b: Lesson) {
  return (
    b.startMin >= a.endMin &&
    b.startMin - a.endMin <= 15 &&
    ids(a.subjects) === ids(b.subjects) &&
    ids(a.classes) === ids(b.classes) &&
    ids(a.teachers) === ids(b.teachers) &&
    ids(a.rooms) === ids(b.rooms)
  );
}

export function computeStatus(lessons: Lesson[], atMin: number) {
  const active = lessons.filter((l) => l.status !== 'cancelled').sort((a, b) => a.startMin - b.startMin);
  const current = active.find((l) => l.startMin <= atMin && atMin < l.endMin) ?? null;
  const next = active.find((l) => l.startMin > atMin) ?? null;
  const previous = [...active].reverse().find((l) => l.endMin <= atMin) ?? null;

  let currentBlockEnd: number | null = null;
  if (current) {
    let last = current;
    for (const l of active) if (continuesBlock(last, l)) last = l;
    currentBlockEnd = last.endMin;
  }

  let state: ElementState;
  if (active.length === 0) state = 'no-lessons';
  else if (current) state = 'in-lesson';
  else if (!previous) state = 'before-school';
  else if (!next) state = 'after-school';
  else state = next.startMin - previous.endMin <= 20 ? 'break' : 'free';

  return { state, current, currentBlockEnd, next, previous };
}

export function periodName(units: TimeUnit[], lesson: Lesson) {
  const unit =
    units.find((u) => u.startMin === lesson.startMin) ??
    units.find((u) => u.startMin <= lesson.startMin && lesson.startMin < u.endMin);
  return unit ? `${unit.name}. Stunde` : null;
}

// ─── Beschriftungen ────────────────────────────────────────────────────────

export const ELEMENT_LABELS: Record<ElementType, { singular: string; plural: string }> = {
  teacher: { singular: 'Lehrkraft', plural: 'Lehrkräfte' },
  class: { singular: 'Klasse', plural: 'Klassen' },
  room: { singular: 'Raum', plural: 'Räume' },
  subject: { singular: 'Gegenstand', plural: 'Gegenstände' },
};

export const VIEW_LABELS: Record<View, string> = {
  dashboard: 'Dashboard',
  week: 'Mein Stundenplan',
  teacher: 'Lehrkräfte',
  class: 'Klassen',
  room: 'Räume',
  free: 'Freie Räume',
  subst: 'Vertretungen',
};

export const STATE_META: Record<ElementState, { label: string; tone: string }> = {
  'in-lesson': { label: 'Im Unterricht', tone: 'green' },
  break: { label: 'Pause', tone: 'amber' },
  free: { label: 'Freistunde', tone: 'blue' },
  'before-school': { label: 'Noch kein Unterricht', tone: 'gray' },
  'after-school': { label: 'Unterricht beendet', tone: 'gray' },
  'no-lessons': { label: 'Kein Unterricht', tone: 'gray' },
};

export type Tone = 'red' | 'amber' | 'blue' | 'gray' | 'green';

export const SUBST_META: Record<SubstitutionType, { label: string; plural: string; tone: Tone }> = {
  cancel: { label: 'Entfall', plural: 'Entfälle', tone: 'red' },
  subst: { label: 'Vertretung', plural: 'Vertretungen', tone: 'amber' },
  add: { label: 'Zusatzstunde', plural: 'Zusatzstunden', tone: 'blue' },
  shift: { label: 'Verlegung', plural: 'Verlegungen', tone: 'blue' },
  rmchg: { label: 'Raumänderung', plural: 'Raumänderungen', tone: 'blue' },
  rmlk: { label: 'Raumsperre', plural: 'Raumsperren', tone: 'gray' },
  bs: { label: 'Pausenaufsicht', plural: 'Pausenaufsichten', tone: 'gray' },
  free: { label: 'Freisetzung', plural: 'Freisetzungen', tone: 'gray' },
  exam: { label: 'Prüfung', plural: 'Prüfungen', tone: 'amber' },
  other: { label: 'Änderung', plural: 'Änderungen', tone: 'gray' },
};

/** Alle Änderungsarten, die auf eine Stunde zutreffen. */
export function lessonChangeTypes(l: Lesson): SubstitutionType[] {
  if (l.status === 'cancelled') return ['cancel'];
  const types: SubstitutionType[] = [];
  if (l.teacherChanged) types.push('subst');
  if (l.roomChanged) types.push('rmchg');
  if (l.lessonType === 'ex') types.push('exam');
  if (l.status === 'irregular' && types.length === 0) types.push('other');
  return types;
}

/** "Huber Maria" → "Huber M." */
export function shortPersonName(longName: string) {
  const [surname, first] = longName.split(' ');
  return first ? `${surname} ${first[0]}.` : surname;
}

export const names = (refs: ElementRef[]) => refs.map((r) => r.name).join(', ');

/** Stabile Pastellfarbe pro Fach. */
export function subjectColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 84%)`;
}

// ─── Daten-Hook ────────────────────────────────────────────────────────────

/**
 * Lädt `path` von der API (null = nichts laden). Alte Daten bleiben beim Neuladen sichtbar,
 * damit nichts flackert. `refreshMs` lädt periodisch neu.
 */
export function useApi<T>(path: string | null, refreshMs?: number) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean; path?: string }>({ loading: !!path });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    api<T>(path, { signal: ctrl.signal }).then(
      (data) => setState({ data, loading: false, path }),
      (err: Error) => {
        if (err.name !== 'AbortError') setState((s) => ({ data: s.data, path: s.path, error: err.message, loading: false }));
      },
    );
    const timer = refreshMs ? setInterval(() => setNonce((n) => n + 1), refreshMs) : undefined;
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [path, nonce, refreshMs]);

  return {
    ...state,
    /** true, wenn die angezeigten Daten zu einer anderen Anfrage gehören */
    stale: state.path !== path,
    reload: () => setNonce((n) => n + 1),
  };
}

/** Query-Parameter für Datum/Uhrzeit (leer = live), z. B. "date=2026-10-21&time=10:00". */
export function momentQuery(date: string | null, time: string | null, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  if (date) p.set('date', date);
  if (time) p.set('time', time);
  return p.toString();
}
