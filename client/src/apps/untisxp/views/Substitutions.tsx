/**
 * Vertretungsplan – Entfälle, Vertretungen, Raumänderungen für einen Tag oder die ganze Woche,
 * mit Filter nach Art und Suche nach Klasse/Lehrkraft/Raum.
 */
import { useState } from 'react';
import { useUx } from '../context';
import { SUBST_META, formatLongDate, momentQuery, useApi } from '../lib';
import type { Substitution, SubstitutionResult, SubstitutionType } from '../types';
import { Badge, EmptyBox, ErrorBox, GroupBox, LoadingBox, MomentBar, RefList, SubstBadge } from '../ui';

const FILTERS: { value: 'all' | SubstitutionType[]; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: ['cancel'], label: 'Entfälle' },
  { value: ['subst'], label: 'Vertretungen' },
  { value: ['rmchg', 'rmlk'], label: 'Raumänderungen' },
  { value: ['add', 'shift', 'exam', 'bs', 'free', 'other'], label: 'Sonstige' },
];

function groupByDate(items: Substitution[]) {
  const map = new Map<string, Substitution[]>();
  for (const s of items) map.set(s.date, [...(map.get(s.date) ?? []), s]);
  return [...map.entries()];
}

export function Substitutions() {
  const { moment, effective } = useUx();
  const [range, setRange] = useState<'day' | 'week'>('day');
  const [filter, setFilter] = useState(0);
  const [query, setQuery] = useState('');
  const res = useApi<SubstitutionResult>(`/untis/substitutions?${momentQuery(moment.date, null, { range })}`, effective.live ? 3 * 60_000 : undefined);
  const data = res.data;

  const types = FILTERS[filter].value;
  const q = query.trim().toLowerCase();
  const items = (data?.items ?? []).filter((s) => {
    if (types !== 'all' && !types.includes(s.type)) return false;
    if (!q) return true;
    return [...s.classes, ...s.teachers, ...s.rooms, ...s.subjects]
      .flatMap((r) => [r.name, r.longName ?? '', r.original?.name ?? ''])
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  const counts = (data?.items ?? []).reduce<Record<string, number>>((acc, s) => ((acc[s.type] = (acc[s.type] ?? 0) + 1), acc), {});
  const isPast = (s: Substitution) => s.date < effective.today || (s.date === effective.today && s.endMin <= effective.atMin);

  return (
    <div className="ux-page">
      <div className="ux-toolrow">
        <MomentBar showTime={false} />
        <div className="ux-segmented" role="tablist">
          {(['day', 'week'] as const).map((r) => (
            <button key={r} role="tab" aria-selected={range === r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>
              {r === 'day' ? 'Tag' : 'Woche'}
            </button>
          ))}
        </div>
      </div>

      <div className="ux-toolrow">
        <div className="ux-filter-chips" role="group" aria-label="Art filtern">
          {FILTERS.map((f, i) => {
            const n = f.value === 'all' ? data?.items.length : f.value.reduce((sum, t) => sum + (counts[t] ?? 0), 0);
            return (
              <button key={f.label} className={`xp-button ${filter === i ? 'ux-live-on' : ''}`} aria-pressed={filter === i} onClick={() => setFilter(i)}>
                {f.label}
                {n !== undefined && <span className="ux-muted"> {n}</span>}
              </button>
            );
          })}
        </div>
        <input className="xp-input ux-search" placeholder="Klasse, Lehrkraft, Raum …" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {data?.source === 'derived' && (
        <p className="cp-hint ux-small">
          Dein Account darf den offiziellen Vertretungsplan nicht abrufen – die Liste wurde aus den Stundenplänen abgeleitet.
        </p>
      )}

      {res.error && (!data || res.stale) ? (
        <ErrorBox error={res.error} onRetry={res.reload} />
      ) : !data || res.stale ? (
        <LoadingBox />
      ) : items.length === 0 ? (
        <EmptyBox
          title={data.items.length === 0 ? 'Keine Änderungen' : 'Keine Treffer'}
          text={data.items.length === 0 ? 'Für diesen Zeitraum gibt es keine Entfälle oder Vertretungen.' : 'Filter oder Suchbegriff anpassen.'}
        />
      ) : (
        groupByDate(items).map(([day, list]) => (
          <GroupBox
            key={day}
            title={formatLongDate(day)}
            action={
              <span className="ux-badges">
                {(Object.keys(SUBST_META) as SubstitutionType[])
                  .filter((t) => list.some((s) => s.type === t))
                  .map((t) => {
                    const n = list.filter((s) => s.type === t).length;
                    return (
                      <Badge key={t} tone="gray">
                        {n} {n === 1 ? SUBST_META[t].label : SUBST_META[t].plural}
                      </Badge>
                    );
                  })}
              </span>
            }
          >
            <table className="ux-table">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Art</th>
                  <th>Klasse</th>
                  <th>Gegenstand</th>
                  <th>Lehrkraft</th>
                  <th>Raum</th>
                  <th>Info</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className={isPast(s) ? 'past' : ''}>
                    <td className="ux-nowrap">
                      {s.start}–{s.end}
                    </td>
                    <td>
                      <SubstBadge type={s.type} />
                    </td>
                    <td>
                      <b>
                        <RefList refs={s.classes} type="class" />
                      </b>
                    </td>
                    <td>
                      <RefList refs={s.subjects} type="subject" />
                    </td>
                    <td>
                      <RefList refs={s.teachers} type="teacher" />
                    </td>
                    <td>
                      <RefList refs={s.rooms} type="room" />
                    </td>
                    <td className="ux-muted ux-ellipsis" title={s.text}>
                      {s.text}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GroupBox>
        ))
      )}
    </div>
  );
}
