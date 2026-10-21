/**
 * Dashboard – Überblick über den Schultag (wie die Startseite von UntisDashboard):
 * Kennzahlen, Raumauslastung pro Stunde, „Wo ist …?“, freie Räume und anstehende Änderungen.
 */
import { useUx } from '../context';
import { formatLongDate, formatMinutes, momentQuery, useApi } from '../lib';
import type { DashboardStats, FreeRoomsResult, PeriodUtilization } from '../types';
import { ElementPicker, EmptyBox, ErrorBox, GroupBox, LoadingBox, MomentBar, RefList, SubstBadge, XpProgress } from '../ui';

const greeting = (min: number) => (min < 11 * 60 ? 'Guten Morgen' : min < 18 * 60 ? 'Guten Tag' : 'Guten Abend');

export function Dashboard() {
  const { moment, effective, navigate } = useUx();
  const q = momentQuery(moment.date, moment.time);
  const refresh = effective.live ? 60_000 : undefined;
  const stats = useApi<DashboardStats>(`/untis/stats?${q}`, refresh);
  const free = useApi<FreeRoomsResult>(`/untis/rooms/free?${q}`, refresh);
  const s = stats.data;
  const nowLabel = effective.live ? 'gerade' : 'zum Zeitpunkt';

  return (
    <div className="ux-page">
      <div className="ux-hero">
        <div>
          <h2>{greeting(effective.atMin)}!</h2>
          <span className="ux-muted">
            {formatLongDate(effective.today)} · {formatMinutes(Math.floor(effective.atMin))}
            {effective.live ? `:${String(effective.seconds).padStart(2, '0')}` : ''}
          </span>
        </div>
        <MomentBar />
      </div>

      {stats.error && !s ? (
        <ErrorBox error={stats.error} onRetry={stats.reload} />
      ) : !s ? (
        <LoadingBox />
      ) : (
        <>
          <div className="ux-kpis">
            <Kpi label="Vertretungen" value={s.substitutions} sub={`von ${s.lessonsToday} Stunden`} onClick={() => navigate({ view: 'subst' })} />
            <Kpi label="Entfälle" value={s.cancellations} sub="Stunden entfallen" onClick={() => navigate({ view: 'subst' })} />
            <Kpi
              label="Raumänderungen"
              value={s.roomChanges}
              sub={s.additional ? `+ ${s.additional} sonstige` : 'heute'}
              onClick={() => navigate({ view: 'subst' })}
            />
            <Kpi label="Räume belegt" value={s.roomsOccupiedNow} total={s.roomsTotal} sub={`Auslastung ${nowLabel}`} onClick={() => navigate({ view: 'free' })} />
            <Kpi label="Lehrkräfte im Unterricht" value={s.teachersInLessonNow} total={s.teachersTotal} sub={nowLabel} onClick={() => navigate({ view: 'teacher' })} />
          </div>

          <div className="ux-columns">
            <GroupBox title="Raumauslastung pro Stunde">
              <UtilizationChart data={s.utilization} atMin={s.atMin} live={s.live} />
            </GroupBox>

            <div className="ux-stack">
              <GroupBox title="Wo ist …?">
                <p className="ux-muted ux-small">Lehrkraft suchen und sofort Raum, Klasse und Restzeit sehen.</p>
                <ElementPicker types={['teacher']} placeholder="Kürzel oder Name …" onSelect={(t) => navigate({ view: 'teacher', id: t.id })} />
              </GroupBox>

              <GroupBox
                title="Jetzt freie Räume"
                action={
                  <button className="ux-link" onClick={() => navigate({ view: 'free' })}>
                    Alle »
                  </button>
                }
              >
                {free.error && !free.data ? (
                  <ErrorBox error={free.error} onRetry={free.reload} />
                ) : !free.data ? (
                  <LoadingBox text="Wird geladen…" />
                ) : free.data.free.length === 0 ? (
                  <span className="ux-muted">Alle Räume sind belegt.</span>
                ) : (
                  <>
                    <p className="ux-muted ux-small">
                      {free.data.free.length} von {free.data.free.length + free.data.occupied.length} Räumen frei
                    </p>
                    <div className="ux-chips">
                      {free.data.free.slice(0, 12).map((r) => (
                        <button key={r.room.id} className="ux-chip" title={r.room.longName} onClick={() => navigate({ view: 'room', id: r.room.id })}>
                          <b>{r.room.name}</b>
                          <span>{r.freeUntilMin === null ? 'ganzer Tag' : `bis ${formatMinutes(r.freeUntilMin)}`}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </GroupBox>
            </div>
          </div>

          <GroupBox
            title="Anstehende Änderungen"
            action={
              <button className="ux-link" onClick={() => navigate({ view: 'subst' })}>
                Vertretungsplan »
              </button>
            }
          >
            {s.upcomingChanges.length === 0 ? (
              <EmptyBox title="Keine weiteren Änderungen" text="Für den Rest des Tages ist alles nach Plan." />
            ) : (
              <table className="ux-table">
                <thead>
                  <tr>
                    <th>Zeit</th>
                    <th>Art</th>
                    <th>Klasse</th>
                    <th>Gegenstand</th>
                    <th>Lehrkraft</th>
                    <th>Raum</th>
                  </tr>
                </thead>
                <tbody>
                  {s.upcomingChanges.map((c) => (
                    <tr key={c.id}>
                      <td className="ux-nowrap">
                        {c.start}–{c.end}
                      </td>
                      <td>
                        <SubstBadge type={c.type} />
                      </td>
                      <td>
                        <RefList refs={c.classes} type="class" />
                      </td>
                      <td>
                        <RefList refs={c.subjects} type="subject" />
                      </td>
                      <td>
                        <RefList refs={c.teachers} type="teacher" />
                      </td>
                      <td>
                        <RefList refs={c.rooms} type="room" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </GroupBox>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, total, sub, onClick }: { label: string; value: number; total?: number; sub?: string; onClick?: () => void }) {
  const pct = total ? Math.round((value / total) * 100) : null;
  return (
    <button className="ux-kpi" onClick={onClick}>
      <span className="ux-kpi-label">{label}</span>
      <span className="ux-kpi-value">
        {value}
        {total !== undefined && <small> / {total}</small>}
      </span>
      {pct !== null && <XpProgress value={pct} label={label} />}
      <span className="ux-muted ux-small">{pct !== null ? `${pct} % ${sub}` : sub}</span>
    </button>
  );
}

/** Säulendiagramm: belegte Räume je Unterrichtsstunde, aktuelle Stunde hervorgehoben. */
function UtilizationChart({ data, atMin, live }: { data: PeriodUtilization[]; atMin: number; live: boolean }) {
  if (data.length === 0) return <EmptyBox title="Kein Zeitraster" text="Für diesen Tag ist kein Unterricht eingetragen." />;
  const max = Math.max(1, ...data.map((d) => d.totalRooms));
  return (
    <div className="ux-chart">
      <div className="ux-chart-bars">
        {data.map((d) => {
          const current = atMin >= d.startMin && atMin < d.endMin;
          return (
            <div key={d.name + d.start} className={`ux-chart-col ${current ? 'current' : ''}`} title={`${d.start}–${d.end}: ${d.occupiedRooms} von ${d.totalRooms} Räumen, ${d.lessons} Stunden`}>
              <span className="ux-chart-num">{d.occupiedRooms}</span>
              <div className="ux-chart-bar" style={{ height: `${(d.occupiedRooms / max) * 100}%` }} />
              <span className="ux-chart-label">{d.name}.</span>
            </div>
          );
        })}
      </div>
      <p className="ux-muted ux-small">
        Belegte Räume je Stunde (von {data[0].totalRooms})
        {live ? ' · orange = laufende Stunde' : ''}
      </p>
    </div>
  );
}
