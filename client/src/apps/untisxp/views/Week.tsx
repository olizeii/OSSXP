/**
 * Mein Stundenplan – Wochenraster des eigenen Untis-Accounts (die ursprüngliche UntisXP-Ansicht).
 */
import { useMemo, useState } from 'react';
import { useUx } from '../context';
import { STATE_META, addDays, computeStatus, formatDuration, formatShortDate, names, startOfWeek, subjectColor, useApi } from '../lib';
import type { Lesson, TimeUnit } from '../types';
import { Badge, ErrorBox, GroupBox, LessonBadges, LoadingBox, RefList } from '../ui';

const STATUS_LABEL = { regular: 'Regulär', cancelled: 'Entfall', irregular: 'Vertretung / Änderung' } as const;

export function Week() {
  const { master, effective, setMoment } = useUx();
  const monday = startOfWeek(effective.date);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  const res = useApi<{ lessons: Lesson[] }>(`/untis/timetable?from=${monday}&to=${days[4]}`, effective.live ? 5 * 60_000 : undefined);
  const [selected, setSelected] = useState<Lesson | null>(null);
  const lessons = res.data?.lessons ?? [];
  const periods = useMemo(() => buildPeriods(master?.timegrid['1'], lessons), [master, lessons]);

  const todays = lessons.filter((l) => l.date === effective.today);
  const live = computeStatus(todays, effective.atMin);
  const cancelled = lessons.filter((l) => l.status === 'cancelled').length;
  const changed = lessons.filter((l) => l.status === 'irregular').length;

  const goWeek = (delta: number) => setMoment({ date: addDays(monday, delta * 7) });

  return (
    <div className="ux-page">
      <div className="ux-toolrow">
        <div className="ux-moment">
          <button className="xp-button" onClick={() => goWeek(-1)}>
            ◄ Vorige Woche
          </button>
          <button className="xp-button" onClick={() => setMoment({ date: null, time: null })}>
            Diese Woche
          </button>
          <button className="xp-button" onClick={() => goWeek(1)}>
            Nächste Woche ►
          </button>
          <span className="ux-moment-label">
            {formatShortDate(days[0])} – {formatShortDate(days[4])}
          </span>
        </div>
        <span className="ux-muted">
          {lessons.length} Stunden · {cancelled} Entfall · {changed} Änderungen
        </span>
      </div>

      {todays.length > 0 && (
        <div className="ux-hint">
          <Badge tone={STATE_META[live.state].tone as 'green'}>{STATE_META[live.state].label}</Badge>
          {live.current ? (
            <span>
              <b>{names(live.current.subjects)}</b> in <RefList refs={live.current.rooms} type="room" /> bei{' '}
              <RefList refs={live.current.teachers} type="teacher" /> · noch {formatDuration(live.current.endMin - effective.atMin)}
            </span>
          ) : live.next ? (
            <span>
              Nächste Stunde: <b>{names(live.next.subjects)}</b> um {live.next.start} in <RefList refs={live.next.rooms} type="room" />
            </span>
          ) : (
            <span className="ux-muted">Heute keine weiteren Stunden.</span>
          )}
        </div>
      )}

      {res.error && !res.data ? (
        <ErrorBox error={res.error} onRetry={res.reload} />
      ) : !res.data ? (
        <LoadingBox />
      ) : (
        <div className="ux-week-wrap xp-scroll">
          <div className="ux-grid" style={{ gridTemplateRows: `26px repeat(${periods.length}, minmax(44px, 1fr))` }}>
            <div className="ux-corner" />
            {days.map((d, i) => (
              <div key={d} className={`ux-dayhead ${d === effective.today ? 'today' : ''}`} style={{ gridColumn: i + 2 }}>
                {formatShortDate(d)}
              </div>
            ))}
            {periods.map((p, row) => (
              <div key={p.name + row} className="ux-period" style={{ gridRow: row + 2 }}>
                <b>{p.name}</b>
                <span>
                  {p.start}
                  <br />
                  {p.end}
                </span>
              </div>
            ))}
            {days.map((d, col) =>
              periods.map((_, row) => (
                <div key={`bg-${col}-${row}`} className={`ux-cell ${d === effective.today ? 'today' : ''}`} style={{ gridColumn: col + 2, gridRow: row + 2 }} />
              )),
            )}
            {days.map((d, col) =>
              groupLessons(lessons.filter((l) => l.date === d), periods).map((g) => (
                <div key={`${col}-${g.row}`} className="ux-slot" style={{ gridColumn: col + 2, gridRow: `${g.row + 2} / span ${g.span}` }}>
                  {g.lessons.map((l) => (
                    <button
                      key={l.id}
                      className={`ux-lesson ${l.status} ${selected?.id === l.id ? 'selected' : ''} ${live.current?.id === l.id ? 'now' : ''}`}
                      style={{ background: l.status === 'cancelled' ? undefined : subjectColor(names(l.subjects)) }}
                      onClick={() => setSelected(l)}
                      title={`${names(l.subjects)} · ${l.start}–${l.end}`}
                    >
                      <b>{names(l.subjects) || '—'}</b>
                      <span>{names(l.rooms)}</span>
                      <span>{names(l.teachers)}</span>
                    </button>
                  ))}
                </div>
              )),
            )}
          </div>
        </div>
      )}

      {selected && (
        <GroupBox
          title="Details"
          action={
            <button className="ux-link" onClick={() => setSelected(null)}>
              Schließen
            </button>
          }
        >
          <dl className="ux-details">
            <dt>Fach</dt>
            <dd>{selected.subjects.map((s) => s.longName || s.name).join(', ') || '—'}</dd>
            <dt>Zeit</dt>
            <dd>
              {formatShortDate(selected.date)}, {selected.start}–{selected.end}
            </dd>
            <dt>Raum</dt>
            <dd>
              <RefList refs={selected.rooms} type="room" />
            </dd>
            <dt>Lehrkraft</dt>
            <dd>
              <RefList refs={selected.teachers} type="teacher" />
            </dd>
            <dt>Klasse</dt>
            <dd>
              <RefList refs={selected.classes} type="class" />
            </dd>
            <dt>Status</dt>
            <dd>
              {STATUS_LABEL[selected.status]} <LessonBadges lesson={selected} />
            </dd>
            {(selected.info || selected.substText || selected.text) && (
              <>
                <dt>Info</dt>
                <dd>{[selected.substText, selected.info, selected.text].filter(Boolean).join(' · ')}</dd>
              </>
            )}
          </dl>
        </GroupBox>
      )}
    </div>
  );
}

/** Zeitraster aus Untis – oder, falls nicht verfügbar, aus den Stunden abgeleitet. */
function buildPeriods(grid: TimeUnit[] | undefined, lessons: Lesson[]): TimeUnit[] {
  if (grid?.length) return grid;
  const byStart = new Map<number, TimeUnit>();
  lessons.forEach((l) => {
    if (!byStart.has(l.startMin)) byStart.set(l.startMin, { name: '', start: l.start, end: l.end, startMin: l.startMin, endMin: l.endMin });
  });
  return [...byStart.values()].sort((a, b) => a.startMin - b.startMin).map((p, i) => ({ ...p, name: String(i + 1) }));
}

/** Gruppiert Stunden eines Tages nach Startperiode; Doppelstunden bekommen span > 1. */
function groupLessons(lessons: Lesson[], periods: TimeUnit[]) {
  const indexOf = (min: number) => {
    const i = periods.findIndex((p) => min >= p.startMin && min < p.endMin);
    if (i >= 0) return i;
    const after = periods.findIndex((p) => p.startMin >= min);
    return after >= 0 ? after : periods.length - 1;
  };
  const groups = new Map<number, { row: number; span: number; lessons: Lesson[] }>();
  for (const l of lessons) {
    const row = indexOf(l.startMin);
    const span = Math.max(1, indexOf(l.endMin - 1) - row + 1);
    const g = groups.get(row) ?? { row, span, lessons: [] };
    g.span = Math.max(g.span, span);
    g.lessons.push(l);
    groups.set(row, g);
  }
  return [...groups.values()];
}
