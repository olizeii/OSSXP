/**
 * Mein Tag – das Schüler-Dashboard (Startansicht von UtisXP):
 * laufende & nächste Stunden mit Countdown, heutiger Stundenplan, eigene Ausfälle/Änderungen
 * der nächsten Tage und anstehende Tests/Schularbeiten.
 */
import { useUx } from '../context';
import {
  STATE_META,
  addDays,
  computeStatus,
  formatCountdown,
  formatDuration,
  formatLongDate,
  formatShortDate,
  lessonChangeTypes,
  names,
  periodName,
  useApi,
} from '../lib';
import type { Lesson } from '../types';
import { Badge, EmptyBox, ErrorBox, GroupBox, LessonBadges, LoadingBox, RefList, XpProgress } from '../ui';

interface Exam {
  id: string;
  date: string;
  start: string;
  end: string;
  subject: string;
  subjectLong?: string;
  name: string;
  type?: string;
  text?: string;
  teachers: string[];
  rooms: string[];
}

const greeting = (min: number) => (min < 11 * 60 ? 'Guten Morgen' : min < 18 * 60 ? 'Guten Tag' : 'Guten Abend');

export function Today() {
  const { effective, master, navigate } = useUx();
  const today = effective.today;
  const week = useApi<{ lessons: Lesson[] }>(`/untis/timetable?from=${today}&to=${addDays(today, 6)}`, 5 * 60_000);
  const exams = useApi<{ items: Exam[]; source: 'api' | 'derived' }>(`/untis/exams?from=${today}&to=${addDays(today, 28)}`, 30 * 60_000);
  const me = useApi<{ class: { name: string; longName?: string } }>('/untis/me');

  const lessons = week.data?.lessons ?? [];
  const todays = lessons.filter((l) => l.date === today).sort((a, b) => a.startMin - b.startMin);
  const live = computeStatus(todays, effective.atMin);
  const units = master?.timegrid[String(new Date(`${today}T12:00`).getDay() || 7)] ?? [];
  const upcoming = todays.filter((l) => l.status !== 'cancelled' && l.startMin > effective.atMin).slice(0, 3);
  const changes = lessons.filter((l) => l.status !== 'regular' && (l.date > today || l.endMin > effective.atMin));

  return (
    <div className="ux-page">
      <div className="ux-hero">
        <div>
          <h2>{greeting(effective.atMin)}!</h2>
          <span className="ux-muted">
            {formatLongDate(today)}
            {me.data?.class && (
              <>
                {' '}
                · Klasse{' '}
                <button className="ux-link" onClick={() => navigate({ view: 'class', id: master?.classes.find((c) => c.name === me.data!.class.name)?.id })}>
                  {me.data.class.name}
                </button>
              </>
            )}
          </span>
        </div>
        <div className="ux-today-kpis">
          <MiniKpi label="Stunden heute" value={todays.filter((l) => l.status !== 'cancelled').length} />
          <MiniKpi label="Ausfälle (7 Tage)" value={lessons.filter((l) => l.status === 'cancelled').length} tone="red" />
          <MiniKpi label="Tests (4 Wochen)" value={exams.data?.items.length ?? 0} tone="amber" />
        </div>
      </div>

      {week.error && !week.data ? (
        <ErrorBox error={week.error} onRetry={week.reload} />
      ) : !week.data ? (
        <LoadingBox />
      ) : (
        <div className="ux-columns">
          <div className="ux-stack">
            <GroupBox title="Jetzt & als Nächstes" action={<Badge tone={STATE_META[live.state].tone as 'green'}>{STATE_META[live.state].label}</Badge>}>
              {live.current ? (
                <div className="ux-now">
                  <div className="ux-now-head">
                    <span className="ux-fact-primary">{names(live.current.subjects)}</span>
                    <span>
                      in <b><RefList refs={live.current.rooms} type="room" /></b> bei <RefList refs={live.current.teachers} type="teacher" />
                    </span>
                    <LessonBadges lesson={live.current} />
                  </div>
                  <div className="ux-countdown-row">
                    <span className="ux-muted">
                      {live.current.start}–{live.current.end}
                      {periodName(units, live.current) ? ` · ${periodName(units, live.current)}` : ''}
                    </span>
                    <span>
                      <span className="ux-muted">Restzeit </span>
                      <span className="ux-countdown">{formatCountdown(live.current.endMin * 60 - (effective.atMin * 60 + effective.seconds))}</span>
                    </span>
                  </div>
                  <XpProgress
                    value={((effective.atMin * 60 + effective.seconds - live.current.startMin * 60) / ((live.current.endMin - live.current.startMin) * 60)) * 100}
                    label="Fortschritt der Stunde"
                  />
                </div>
              ) : (
                <p className="ux-muted">
                  {live.state === 'no-lessons'
                    ? 'Heute ist kein Unterricht eingetragen.'
                    : live.state === 'after-school'
                      ? 'Für heute ist der Unterricht vorbei.'
                      : 'Gerade kein Unterricht.'}
                </p>
              )}

              {upcoming.length > 0 && (
                <ul className="ux-next-list">
                  {upcoming.map((l) => (
                    <li key={l.id}>
                      <span className="ux-nowrap">{l.start}</span>
                      <b>{names(l.subjects)}</b>
                      <span>
                        <RefList refs={l.rooms} type="room" />
                      </span>
                      <span className="ux-muted">
                        <RefList refs={l.teachers} type="teacher" />
                      </span>
                      <span className="ux-muted ux-push">in {formatDuration(l.startMin - effective.atMin)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </GroupBox>

            <GroupBox title="Heutiger Stundenplan" action={<button className="ux-link" onClick={() => navigate({ view: 'week' })}>Ganze Woche »</button>}>
              {todays.length === 0 ? (
                <EmptyBox title="Kein Unterricht" text="Heute stehen keine Stunden im Plan." />
              ) : (
                <table className="ux-table">
                  <tbody>
                    {todays.map((l) => {
                      const now = live.current?.id === l.id;
                      const past = l.endMin <= effective.atMin;
                      return (
                        <tr key={l.id} className={`${now ? 'now' : ''} ${past ? 'past' : ''} ${l.status === 'cancelled' ? 'cancelled' : ''}`}>
                          <td className="ux-nowrap">
                            {l.start}–{l.end}
                          </td>
                          <td>
                            <b className="ux-subject" title={l.subjects.map((s) => s.longName).join(', ')}>
                              {names(l.subjects)}
                            </b>{' '}
                            <LessonBadges lesson={l} />
                          </td>
                          <td>
                            <RefList refs={l.rooms} type="room" />
                          </td>
                          <td>
                            <RefList refs={l.teachers} type="teacher" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </GroupBox>
          </div>

          <div className="ux-stack">
            <GroupBox title="Anstehende Tests">
              {exams.error && !exams.data ? (
                <ErrorBox error={exams.error} onRetry={exams.reload} />
              ) : !exams.data ? (
                <LoadingBox text="Wird geladen…" />
              ) : exams.data.items.length === 0 ? (
                <EmptyBox title="Keine Tests eingetragen" text="In den nächsten 4 Wochen steht nichts in Untis. Viel Spaß!" />
              ) : (
                <ul className="ux-exams">
                  {exams.data.items.map((e) => {
                    const days = Math.round((Date.parse(`${e.date}T12:00`) - Date.parse(`${today}T12:00`)) / 86_400_000);
                    return (
                      <li key={e.id} className={days <= 3 ? 'soon' : ''}>
                        <div className="ux-exam-date">
                          <b>{new Date(`${e.date}T12:00`).getDate()}.</b>
                          <span>{new Date(`${e.date}T12:00`).toLocaleDateString('de-DE', { month: 'short' })}</span>
                        </div>
                        <div className="ux-exam-main">
                          <b>{e.name}</b>
                          <span className="ux-muted">
                            {formatShortDate(e.date)} · {e.start}–{e.end}
                            {e.rooms.length ? ` · ${e.rooms.join(', ')}` : ''}
                            {e.teachers.length ? ` · ${e.teachers.join(', ')}` : ''}
                          </span>
                          {e.text && <span className="ux-small ux-muted">{e.text}</span>}
                        </div>
                        <Badge tone={days <= 3 ? 'red' : days <= 7 ? 'amber' : 'blue'}>{days === 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
              {exams.data?.source === 'derived' && (
                <p className="ux-small ux-muted">Aus dem Stundenplan erkannt (Prüfungsliste von Untis nicht verfügbar).</p>
              )}
            </GroupBox>

            <GroupBox title="Ausfälle & Änderungen (7 Tage)">
              {changes.length === 0 ? (
                <EmptyBox title="Alles nach Plan" text="Keine Entfälle oder Vertretungen in deinem Stundenplan." />
              ) : (
                <table className="ux-table">
                  <tbody>
                    {changes.map((l) => (
                      <tr key={l.id}>
                        <td className="ux-nowrap">
                          {l.date === today ? 'Heute' : formatShortDate(l.date)}
                          <br />
                          <span className="ux-muted">{l.start}</span>
                        </td>
                        <td>
                          <b>{names(l.subjects)}</b>
                          <br />
                          <span className="ux-badges">
                            {lessonChangeTypes(l).map((t) => (
                              <Badge key={t} tone={t === 'cancel' ? 'red' : 'amber'}>
                                {t === 'cancel' ? 'Entfall' : t === 'subst' ? 'Vertretung' : t === 'rmchg' ? 'Raumänderung' : 'Änderung'}
                              </Badge>
                            ))}
                          </span>
                        </td>
                        <td>
                          <RefList refs={l.teachers} type="teacher" />
                          <br />
                          <RefList refs={l.rooms} type="room" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </GroupBox>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: number; tone?: 'red' | 'amber' }) {
  return (
    <div className={`ux-mini-kpi ${tone ?? ''}`}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
