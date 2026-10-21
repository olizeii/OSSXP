/**
 * Typen, Datums-Helfer, Live-Status und Daten-Hook für UntisXP.
 * Die Lesson-Felder entsprechen dem normalisierten Format des Servers
 * (angelehnt an UntisDashboard: src/lib/untis/types.ts & status.ts).
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../core/api';

export interface ElementRef {
  name: string;
  longName: string;
  original?: { name: string };
}

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  startMin: number;
  endMin: number;
  subjects: ElementRef[];
  teachers: ElementRef[];
  rooms: ElementRef[];
  classes: ElementRef[];
  status: 'regular' | 'cancelled' | 'irregular';
  info: string;
  substText: string;
  text: string;
}

export interface TimeUnit {
  name: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
}

/** ISO-Wochentag (1 = Montag) → Zeitraster */
export type Timegrid = Record<string, TimeUnit[]>;

// ─── Datum ─────────────────────────────────────────────────────────────────

export const toIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function mondayOf(d: Date) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const fmtDay = (d: Date) => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
export const fmtDate = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

// ─── Live-Status (wie „Jetzt“-Anzeige im UntisDashboard) ───────────────────

export function liveStatus(lessons: Lesson[], now = new Date()) {
  const today = toIso(now);
  const minute = now.getHours() * 60 + now.getMinutes();
  const todays = lessons.filter((l) => l.date === today && l.status !== 'cancelled');
  const current = todays.find((l) => l.startMin <= minute && minute < l.endMin) ?? null;
  const next = todays.find((l) => l.startMin > minute) ?? null;
  return {
    current,
    next,
    minutesLeft: current ? current.endMin - minute : null,
    minutesUntilNext: next ? next.startMin - minute : null,
  };
}

/** Stabile Farbe pro Fach (gleiches Fach = gleiche Farbe). */
export function subjectColor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 82%)`;
}

export const names = (refs: ElementRef[]) => refs.map((r) => r.name).join(', ');

// ─── Daten laden ───────────────────────────────────────────────────────────

const REFRESH_MS = 5 * 60_000;

export function useTimetable(monday: Date) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [timegrid, setTimegrid] = useState<Timegrid | null>(null);
  const [mode, setMode] = useState<'live' | 'demo'>('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const from = toIso(monday);
  const to = toIso(addDays(monday, 4));

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const res = await api<{ lessons: Lesson[]; mode: 'live' | 'demo' }>(`/untis/timetable?from=${from}&to=${to}`, { signal });
        setLessons(res.lessons);
        setMode(res.mode);
        setUpdatedAt(new Date());
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    const timer = setInterval(() => load(ctrl.signal), REFRESH_MS);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [load]);

  // Zeitraster ändert sich praktisch nie → einmal laden
  useEffect(() => {
    api<{ timegrid: Timegrid }>('/untis/timegrid')
      .then((r) => setTimegrid(r.timegrid))
      .catch(() => setTimegrid({}));
  }, []);

  return { lessons, timegrid, mode, loading, error, updatedAt, reload: () => load() };
}
