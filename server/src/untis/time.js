/**
 * Datums-/Zeit-Helfer für Untis (aus UntisDashboard/src/lib/time.ts portiert).
 * Datumswerte sind ISO-Strings ("2026-10-21"), Uhrzeiten Minuten seit Mitternacht.
 */

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (v) => typeof v === 'string' && ISO_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** "07:45" → 465 (NaN bei ungültiger Eingabe) */
export function parseTime(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v ?? ''));
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : NaN;
}

/** 465 → "07:45" */
export const formatMinutes = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Untis-Zahlen: 20261021 ↔ "2026-10-21", 745 ↔ 465 Minuten */
export const isoToUntisDate = (iso) => Number(iso.replaceAll('-', ''));
export const untisDateToIso = (n) => {
  const s = String(n);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
};
export const untisTimeToMinutes = (n) => Math.floor(n / 100) * 60 + (n % 100);

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (d) => d.toISOString().slice(0, 10);

export const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
};

/** 1 = Montag … 7 = Sonntag */
export const isoWeekday = (iso) => toDate(iso).getUTCDay() || 7;

export const startOfWeek = (iso) => addDays(iso, 1 - isoWeekday(iso));

export const daysBetween = (from, to) => Math.round((toDate(to) - toDate(from)) / 86_400_000);

/** Aktuelles Datum + Minuten in der Zeitzone der Schule. */
export function zonedNow(timeZone, at = Date.now()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
