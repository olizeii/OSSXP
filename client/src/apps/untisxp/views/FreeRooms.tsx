/**
 * Freie Räume – welche Räume sind zum gewählten Zeitpunkt frei, und wie lange noch?
 * Belegte Räume darunter mit Klasse, Gegenstand, Lehrkraft und „belegt bis“.
 */
import { useState } from 'react';
import { useUx } from '../context';
import { formatDuration, formatMinutes, momentQuery, useApi } from '../lib';
import type { FreeRoomsResult, RoomAvailability } from '../types';
import { EmptyBox, ErrorBox, Glyph, GroupBox, LoadingBox, MomentBar, RefList } from '../ui';

export function FreeRooms() {
  const { moment, effective, navigate } = useUx();
  const res = useApi<FreeRoomsResult>(`/untis/rooms/free?${momentQuery(moment.date, moment.time)}`, effective.live ? 60_000 : undefined);
  const [query, setQuery] = useState('');
  const [building, setBuilding] = useState('');

  const data = res.data;
  const all = [...(data?.free ?? []), ...(data?.occupied ?? [])];
  const buildings = [...new Set(all.map((r) => r.room.building).filter(Boolean))] as string[];
  const q = query.trim().toLowerCase();
  const matches = (r: RoomAvailability) =>
    (!building || r.room.building === building) && (!q || `${r.room.name} ${r.room.longName ?? ''}`.toLowerCase().includes(q));
  const free = data?.free.filter(matches) ?? [];
  const occupied = data?.occupied.filter(matches) ?? [];

  return (
    <div className="ux-page">
      <div className="ux-toolrow">
        <MomentBar />
        <div className="ux-filters">
          <input className="xp-input" placeholder="Raum filtern …" value={query} onChange={(e) => setQuery(e.target.value)} />
          {buildings.length > 1 && (
            <select className="xp-select" value={building} onChange={(e) => setBuilding(e.target.value)} aria-label="Gebäude">
              <option value="">Alle Gebäude</option>
              {buildings.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {res.error && !data ? (
        <ErrorBox error={res.error} onRetry={res.reload} />
      ) : !data ? (
        <LoadingBox />
      ) : (
        <>
          <GroupBox title={`Frei um ${formatMinutes(data.atMin)} – ${free.length} von ${free.length + occupied.length}`}>
            {free.length === 0 ? (
              <EmptyBox title="Keine freien Räume" text={q || building ? 'Filter anpassen.' : 'Zu diesem Zeitpunkt sind alle Räume belegt.'} />
            ) : (
              <ul className="ux-tiles">
                {free.map((r) => (
                  <li key={r.room.id}>
                    <button className="ux-tile" onClick={() => navigate({ view: 'room', id: r.room.id })}>
                      <Glyph name="door" size={32} />
                      <span>
                        <b>{r.room.name}</b>
                        <span className="ux-muted">
                          {r.room.longName}
                          {r.room.building ? ` · ${r.room.building}` : ''}
                        </span>
                        {r.freeUntilMin === null ? (
                          <span className="ux-green">Rest des Tages frei</span>
                        ) : (
                          <span>
                            frei bis <b>{formatMinutes(r.freeUntilMin)}</b>
                            <span className="ux-muted"> · {formatDuration(r.freeUntilMin - data.atMin)}</span>
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </GroupBox>

          {occupied.length > 0 && (
            <GroupBox title={`Belegt – ${occupied.length}`}>
              <table className="ux-table">
                <thead>
                  <tr>
                    <th>Raum</th>
                    <th>Klasse</th>
                    <th>Gegenstand</th>
                    <th>Lehrkraft</th>
                    <th>Belegt bis</th>
                  </tr>
                </thead>
                <tbody>
                  {occupied.map((r) => {
                    const l = r.occupiedBy!;
                    return (
                      <tr key={r.room.id}>
                        <td>
                          <RefList refs={[r.room]} type="room" />
                        </td>
                        <td>
                          <RefList refs={l.classes} type="class" />
                        </td>
                        <td>
                          <RefList refs={l.subjects} type="subject" />
                        </td>
                        <td>
                          <RefList refs={l.teachers} type="teacher" />
                        </td>
                        <td className="ux-nowrap">{formatMinutes(r.busyUntilMin ?? l.endMin)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GroupBox>
          )}
        </>
      )}
    </div>
  );
}
