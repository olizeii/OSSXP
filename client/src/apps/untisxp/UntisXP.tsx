/**
 * UntisXP – der Wochenstundenplan im Look des XP-Explorers:
 * Symbolleiste oben, blauer Aufgabenbereich links (Jetzt / Nächste Stunde / Details),
 * Stundenplan-Raster rechts, Statusleiste unten.
 */
import { useEffect, useMemo, useState } from 'react';
import type { AppWindowProps } from '../../core/types';
import { launchApp } from '../../core/launcher';
import { useAuthStore } from '../../store/authStore';
import {
  addDays,
  fmtDate,
  fmtDay,
  liveStatus,
  mondayOf,
  names,
  subjectColor,
  toIso,
  useTimetable,
  type Lesson,
  type TimeUnit,
} from './untis';
import '../account/account.css';
import './untisxp.css';

const STATUS_LABEL = { regular: 'Regulär', cancelled: 'Entfall', irregular: 'Vertretung / Änderung' } as const;

export default function UntisXP(_props: AppWindowProps) {
  const untis = useAuthStore((s) => s.user?.untis);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [selected, setSelected] = useState<Lesson | null>(null);
  const now = useNow();
  const { lessons, timegrid, mode, loading, error, updatedAt, reload } = useTimetable(monday);

  const days = useMemo(() => [0, 1, 2, 3, 4].map((i) => addDays(monday, i)), [monday]);
  const periods = useMemo(() => buildPeriods(timegrid?.['1'], lessons), [timegrid, lessons]);
  const live = liveStatus(lessons, now);
  const today = toIso(now);
  const cancelled = lessons.filter((l) => l.status === 'cancelled').length;
  const changed = lessons.filter((l) => l.status === 'irregular').length;

  return (
    <div className="ux">
      {/* ── Symbolleiste ── */}
      <div className="ux-toolbar">
        <ToolButton label="Zurück" onClick={() => setMonday((m) => addDays(m, -7))} icon="back" />
        <ToolButton label="Vor" onClick={() => setMonday((m) => addDays(m, 7))} icon="forward" />
        <span className="ux-tool-sep" />
        <ToolButton label="Heute" onClick={() => setMonday(mondayOf(new Date()))} icon="today" />
        <ToolButton label="Aktualisieren" onClick={reload} icon="refresh" />
      </div>
      <div className="ux-address">
        <span className="ux-address-label">Adresse</span>
        <div className="ux-address-field">
          Woche {fmtDate(days[0])} – {fmtDate(days[4])}
          {untis && <span className="ux-address-school"> · {untis.school}</span>}
        </div>
      </div>

      <div className="ux-main">
        {/* ── Aufgabenbereich ── */}
        <aside className="cp-taskpane xp-scroll">
          <div className="cp-box">
            <div className="cp-box-title">Jetzt</div>
            <div className="cp-box-body ux-box">
              {live.current ? (
                <>
                  <b>{names(live.current.subjects)}</b> in {names(live.current.rooms)}
                  <div>bei {names(live.current.teachers)}</div>
                  <div className="ux-countdown">noch {live.minutesLeft} min</div>
                </>
              ) : (
                <span>Gerade kein Unterricht.</span>
              )}
            </div>
          </div>

          <div className="cp-box">
            <div className="cp-box-title">Nächste Stunde</div>
            <div className="cp-box-body ux-box">
              {live.next ? (
                <>
                  <b>{names(live.next.subjects)}</b> um {live.next.start}
                  <div>
                    {names(live.next.rooms)} · {names(live.next.teachers)}
                  </div>
                  <div className="ux-countdown">in {live.minutesUntilNext} min</div>
                </>
              ) : (
                <span>Heute keine weiteren Stunden.</span>
              )}
            </div>
          </div>

          <div className="cp-box">
            <div className="cp-box-title">Details</div>
            <div className="cp-box-body ux-box">
              {selected ? (
                <LessonDetails lesson={selected} />
              ) : (
                <span>Klicken Sie auf eine Stunde, um Details anzuzeigen.</span>
              )}
            </div>
          </div>

          <div className="cp-box">
            <div className="cp-box-title">Weitere Aufgaben</div>
            <div className="cp-box-body">
              <button className="cp-task" onClick={() => launchApp('account', { tab: 'untis' })}>
                Untis-Verknüpfung verwalten
              </button>
            </div>
          </div>
        </aside>

        {/* ── Stundenplan ── */}
        <div className="ux-grid-wrap xp-scroll">
          {error ? (
            <div className="ux-error">
              <b>Der Stundenplan konnte nicht geladen werden.</b>
              <p>{error}</p>
              <button className="xp-button" onClick={reload}>
                Erneut versuchen
              </button>
            </div>
          ) : (
            <div
              className="ux-grid"
              style={{ gridTemplateRows: `26px repeat(${periods.length}, minmax(44px, 1fr))` }}
            >
              <div className="ux-corner" />
              {days.map((d, i) => (
                <div key={i} className={`ux-dayhead ${toIso(d) === today ? 'today' : ''}`} style={{ gridColumn: i + 2 }}>
                  {fmtDay(d)}
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

              {/* Hintergrundzellen */}
              {days.map((d, col) =>
                periods.map((_, row) => (
                  <div
                    key={`bg-${col}-${row}`}
                    className={`ux-cell ${toIso(d) === today ? 'today' : ''}`}
                    style={{ gridColumn: col + 2, gridRow: row + 2 }}
                  />
                )),
              )}

              {/* Stunden */}
              {days.map((d, col) =>
                groupLessons(lessons.filter((l) => l.date === toIso(d)), periods).map((g) => (
                  <div
                    key={`${col}-${g.row}`}
                    className="ux-slot"
                    style={{ gridColumn: col + 2, gridRow: `${g.row + 2} / span ${g.span}` }}
                  >
                    {g.lessons.map((l) => (
                      <button
                        key={l.id}
                        className={`ux-lesson ${l.status} ${selected?.id === l.id ? 'selected' : ''} ${
                          live.current?.id === l.id ? 'now' : ''
                        }`}
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
          )}
        </div>
      </div>

      <div className="xp-statusbar">
        <span>{loading ? 'Wird geladen…' : `${lessons.length} Stunden · ${cancelled} Entfall · ${changed} Änderungen`}</span>
        <span style={{ flex: '0 0 170px' }}>{mode === 'demo' ? 'Demo-Daten' : 'WebUntis (live)'}</span>
        <span style={{ flex: '0 0 170px' }}>
          {updatedAt ? `Aktualisiert ${updatedAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      </div>
    </div>
  );
}

function LessonDetails({ lesson: l }: { lesson: Lesson }) {
  const teacherChange = l.teachers.find((t) => t.original);
  return (
    <dl className="ux-details">
      <dt>Fach</dt>
      <dd>{l.subjects.map((s) => s.longName || s.name).join(', ') || '—'}</dd>
      <dt>Zeit</dt>
      <dd>
        {new Date(`${l.date}T12:00`).toLocaleDateString('de-DE', { weekday: 'long' })}, {l.start}–{l.end}
      </dd>
      <dt>Raum</dt>
      <dd>{names(l.rooms) || '—'}</dd>
      <dt>Lehrkraft</dt>
      <dd>
        {names(l.teachers) || '—'}
        {teacherChange && <s style={{ marginLeft: 4 }}>{teacherChange.original!.name}</s>}
      </dd>
      <dt>Status</dt>
      <dd className={`ux-status-${l.status}`}>{STATUS_LABEL[l.status]}</dd>
      {(l.info || l.substText || l.text) && (
        <>
          <dt>Info</dt>
          <dd>{[l.substText, l.info, l.text].filter(Boolean).join(' · ')}</dd>
        </>
      )}
    </dl>
  );
}

// ─── Hilfsfunktionen ───────────────────────────────────────────────────────

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

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** XP-Symbolleisten-Button mit kleinem Icon. */
function ToolButton({ label, icon, onClick }: { label: string; icon: 'back' | 'forward' | 'today' | 'refresh'; onClick: () => void }) {
  const glyph = {
    back: <path d="M14 4 6 12l8 8V15h6V9h-6Z" fill="url(#tb-g)" stroke="#1b6d0c" />,
    forward: <path d="M10 4l8 8-8 8V15H4V9h6Z" fill="url(#tb-g)" stroke="#1b6d0c" />,
    today: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" fill="#fff" stroke="#3a62a8" />
        <rect x="3" y="5" width="18" height="5" rx="2" fill="#e8601c" />
        <text x="12" y="19" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#3a62a8">
          {new Date().getDate()}
        </text>
      </>
    ),
    refresh: (
      <>
        <path d="M19 12a7 7 0 1 1-2.2-5.1" fill="none" stroke="#2b7de0" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M14.5 3.5h4.5V8" fill="none" stroke="#2b7de0" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
  }[icon];
  return (
    <button className="ux-tool" onClick={onClick}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <radialGradient id="tb-g" cx=".4" cy=".3" r=".8">
            <stop offset="0" stopColor="#b9f59a" />
            <stop offset="1" stopColor="#2f9a18" />
          </radialGradient>
        </defs>
        {glyph}
      </svg>
      <span>{label}</span>
    </button>
  );
}
