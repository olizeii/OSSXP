/**
 * Lehrkräfte / Klassen / Räume – „Wo ist X gerade?“ (Element-Explorer aus UntisDashboard):
 * Suche, Verzeichnis, Live-Status mit Sekunden-Countdown und Tagesplan.
 */
import { useMemo, useState } from 'react';
import { useUx, type EffectiveMoment } from '../context';
import {
  ELEMENT_LABELS,
  STATE_META,
  computeStatus,
  formatCountdown,
  formatDuration,
  formatMinutes,
  momentQuery,
  periodName,
  shortPersonName,
  useApi,
} from '../lib';
import type { ElementRef, ElementStatus, ElementType, Lesson, TimeUnit, UntisElement } from '../types';
import { Badge, ElementPicker, EmptyBox, ErrorBox, Glyph, GroupBox, LessonBadges, LoadingBox, MomentBar, RefList, XpProgress } from '../ui';

type Key = 'rooms' | 'classes' | 'teachers' | 'subjects';

/** Welche Angaben pro Elementtyp im Vordergrund stehen (erste = groß). */
const FACTS: Record<ElementType, { key: Key; type: ElementType; label: string }[]> = {
  teacher: [
    { key: 'rooms', type: 'room', label: 'Raum' },
    { key: 'classes', type: 'class', label: 'Klasse' },
    { key: 'subjects', type: 'subject', label: 'Gegenstand' },
  ],
  class: [
    { key: 'rooms', type: 'room', label: 'Raum' },
    { key: 'teachers', type: 'teacher', label: 'Lehrkraft' },
    { key: 'subjects', type: 'subject', label: 'Gegenstand' },
  ],
  room: [
    { key: 'classes', type: 'class', label: 'Klasse' },
    { key: 'teachers', type: 'teacher', label: 'Lehrkraft' },
    { key: 'subjects', type: 'subject', label: 'Gegenstand' },
  ],
  subject: [],
};

export function ElementView({ type }: { type: 'teacher' | 'class' | 'room' }) {
  const { route, navigate, master, moment, effective } = useUx();
  const id = route.id ?? null;
  const label = ELEMENT_LABELS[type];
  const status = useApi<ElementStatus>(
    id ? `/untis/element?${momentQuery(moment.date, moment.time, { type, id })}` : null,
    effective.live ? 60_000 : undefined,
  );
  const list = master ? (type === 'teacher' ? master.teachers : type === 'class' ? master.classes : master.rooms) : [];

  return (
    <div className="ux-page">
      <div className="ux-toolrow">
        <ElementPicker
          types={[type]}
          placeholder={type === 'teacher' ? 'Lehrkraft: Kürzel oder Name …' : `${label.singular} suchen …`}
          onSelect={(el) => navigate({ view: type, id: el.id })}
        />
        <MomentBar />
      </div>

      {!master ? (
        <LoadingBox text="Stammdaten werden geladen…" />
      ) : type === 'teacher' && list.length === 0 ? (
        <EmptyBox
          title="Keine Lehrkräfte verfügbar"
          text="Dein WebUntis-Account bekommt keine Lehrer-Daten – weder als Liste noch in den Stundenplänen. Das ist eine Einstellung der Schule (oft bei Schüler-Accounts). Abhilfe: einen Account mit Lehrer-Leserechten verknüpfen."
        />
      ) : !id ? (
        <Directory type={type} items={list} derived={type === 'teacher' && master.teacherSource === 'derived'} />
      ) : status.error && (!status.data || status.stale) ? (
        <ErrorBox error={status.error} onRetry={status.reload} />
      ) : !status.data || status.stale ? (
        <LoadingBox />
      ) : (
        <div className="ux-columns">
          <LiveStatus status={status.data} type={type} moment={effective} />
          <DayTimeline status={status.data} type={type} moment={effective} />
        </div>
      )}
    </div>
  );
}

// ─── Verzeichnis ───────────────────────────────────────────────────────────

function Directory({ type, items, derived }: { type: ElementType; items: UntisElement[]; derived: boolean }) {
  const { navigate } = useUx();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = items.filter((t) => !q || `${t.name} ${t.longName ?? ''} ${t.building ?? ''}`.toLowerCase().includes(q));
  const label = ELEMENT_LABELS[type];
  const glyph = type === 'teacher' ? 'teacher' : type === 'class' ? 'class' : 'room';

  return (
    <GroupBox
      title={type === 'teacher' ? 'Lehrerverzeichnis' : `Alle ${label.plural}`}
      action={<input className="xp-input" placeholder="Filtern …" value={query} onChange={(e) => setQuery(e.target.value)} />}
    >
      <p className="ux-muted ux-small">
        {items.length} {label.plural}
        {derived ? ' · aus den Stundenplänen abgeleitet (der Account darf die Lehrerliste nicht direkt abrufen)' : ''} · Klicken zeigt, wo{' '}
        {type === 'room' ? 'was stattfindet' : 'sie gerade sind'}.
      </p>
      {visible.length === 0 ? (
        <EmptyBox title="Keine Treffer" />
      ) : (
        <ul className="ux-tiles">
          {visible.map((t) => (
            <li key={t.id}>
              <button className="ux-tile" onClick={() => navigate({ view: type as 'teacher', id: t.id })}>
                <Glyph name={glyph} size={32} />
                <span>
                  <b>{t.name}</b>
                  <span className="ux-muted">
                    {t.longName && t.longName !== t.name ? t.longName : '–'}
                    {t.building ? ` · ${t.building}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </GroupBox>
  );
}

// ─── Live-Status ───────────────────────────────────────────────────────────

function Fact({ label, refs, type, primary }: { label: string; refs: ElementRef[]; type: ElementType; primary?: boolean }) {
  const longNames = refs.map((r) => r.longName).filter((n) => n && !refs.some((r) => r.name === n));
  return (
    <div className="ux-fact">
      <span className="ux-fact-label">{label}</span>
      <span className={primary ? 'ux-fact-primary' : 'ux-fact-value'}>
        <RefList refs={refs} type={type} names={false} />
      </span>
      {longNames.length > 0 && <span className="ux-muted ux-small ux-ellipsis">{longNames.join(', ')}</span>}
    </div>
  );
}

function NextHint({ lesson, type, units, atMin, prefix }: { lesson: Lesson; type: ElementType; units: TimeUnit[]; atMin: number; prefix: string }) {
  const [first, ...rest] = FACTS[type];
  const period = periodName(units, lesson);
  return (
    <div className="ux-hint">
      <span className="ux-muted">{prefix}</span>
      <b>
        {lesson.start}–{lesson.end}
        {period ? ` · ${period}` : ''}
      </b>
      <span className="ux-muted">in</span>
      <b>
        <RefList refs={lesson[first.key]} type={first.type} />
      </b>
      {rest.map((f) => (
        <span key={f.key}>
          · <RefList refs={lesson[f.key]} type={f.type} />
        </span>
      ))}
      {lesson.startMin > atMin && <span className="ux-muted ux-push">in {formatDuration(lesson.startMin - atMin)}</span>}
    </div>
  );
}

function LiveStatus({ status, type, moment }: { status: ElementStatus; type: ElementType; moment: EffectiveMoment }) {
  // Live: jede Sekunde im Browser neu auswerten, damit der Status exakt zum Läuten umspringt
  const live = moment.live && moment.date === status.date;
  const atMin = live ? moment.atMin : status.atMin;
  const { state, current, next, previous, currentBlockEnd } = useMemo(
    () => (live ? computeStatus(status.lessons, atMin) : status),
    [live, status, atMin],
  );
  const meta = STATE_META[state];
  const units = status.timegrid;

  const nowSeconds = atMin * 60 + (live ? moment.seconds : 0);
  const remaining = current ? current.endMin * 60 - nowSeconds : 0;
  const progress = current ? ((nowSeconds - current.startMin * 60) / ((current.endMin - current.startMin) * 60)) * 100 : 0;
  const period = current ? periodName(units, current) : null;
  const blockEnd = currentBlockEnd ?? current?.endMin ?? 0;
  const afterBlock = current ? (status.lessons.find((l) => l.status !== 'cancelled' && l.startMin >= blockEnd) ?? null) : null;
  const facts = FACTS[type];

  return (
    <GroupBox
      className="ux-live"
      title={
        <>
          <span className="ux-muted ux-small">{ELEMENT_LABELS[type].singular}</span>{' '}
          <span className="ux-live-name">{status.element.name}</span>{' '}
          {status.element.longName && status.element.longName !== status.element.name && (
            <span className="ux-muted">{type === 'teacher' ? status.element.longName : status.element.longName}</span>
          )}
        </>
      }
      action={
        <span className="ux-live-badges">
          {live && (
            <span className="ux-live-dot">
              <span /> Live
            </span>
          )}
          <Badge tone={meta.tone as 'green'}>{meta.label}</Badge>
        </span>
      }
    >
      {current ? (
        <>
          <div className="ux-facts">
            {facts.map((f, i) => (
              <Fact key={f.key} label={f.label} refs={current[f.key]} type={f.type} primary={i === 0} />
            ))}
          </div>
          <LessonBadges lesson={current} />
          {(current.substText || current.text || current.info) && (
            <p className="ux-muted">{[current.substText, current.text, current.info].filter(Boolean).join(' · ')}</p>
          )}
          <div className="ux-countdown-row">
            <span className="ux-muted">
              🕒 {current.start}–{current.end}
              {period ? ` · ${period}` : ''}
            </span>
            <span>
              <span className="ux-muted">Restzeit </span>
              <span className="ux-countdown">{live ? formatCountdown(remaining) : formatDuration(Math.ceil(remaining / 60))}</span>
            </span>
          </div>
          <XpProgress value={progress} label="Fortschritt der Stunde" />
          {currentBlockEnd && currentBlockEnd > current.endMin && (
            <p className="ux-muted ux-small">Doppelstunde – im selben Raum bis {formatMinutes(currentBlockEnd)}</p>
          )}
          {afterBlock && <NextHint lesson={afterBlock} type={type} units={units} atMin={atMin} prefix="Danach" />}
        </>
      ) : (
        <div className="ux-stack">
          {state === 'no-lessons' && <p className="ux-muted">An diesem Tag sind keine Stunden eingetragen (Wochenende, Ferien oder alles entfallen).</p>}
          {state === 'before-school' && <p className="ux-muted">Der Unterricht hat noch nicht begonnen.</p>}
          {state === 'after-school' && previous && (
            <p className="ux-muted">
              Letzte Stunde endete um <b>{previous.end}</b>.
            </p>
          )}
          {(state === 'break' || state === 'free') && previous && (
            <p className="ux-muted">
              Zuletzt bis {previous.end} in <RefList refs={previous[facts[0].key]} type={facts[0].type} />.
            </p>
          )}
          {next && <NextHint lesson={next} type={type} units={units} atMin={atMin} prefix="Nächste Stunde" />}
        </div>
      )}
    </GroupBox>
  );
}

// ─── Tagesplan ─────────────────────────────────────────────────────────────

const COLUMNS: Record<ElementType, { key: Key; type: ElementType; label: string }[]> = {
  teacher: [
    { key: 'classes', type: 'class', label: 'Klasse' },
    { key: 'rooms', type: 'room', label: 'Raum' },
  ],
  class: [
    { key: 'teachers', type: 'teacher', label: 'Lehrkraft' },
    { key: 'rooms', type: 'room', label: 'Raum' },
  ],
  room: [
    { key: 'classes', type: 'class', label: 'Klasse' },
    { key: 'teachers', type: 'teacher', label: 'Lehrkraft' },
  ],
  subject: [],
};

interface Row {
  key: string;
  label: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  lessons: Lesson[];
}

/** Zeilen = Unterrichtsstunden des Zeitrasters; Stunden außerhalb des Rasters bekommen eigene Zeilen. */
function buildRows(units: TimeUnit[], lessons: Lesson[]): Row[] {
  const used = new Set<Lesson>();
  const rows: Row[] = units.map((u) => {
    const inUnit = lessons.filter((l) => l.startMin < u.endMin && l.endMin > u.startMin);
    inUnit.forEach((l) => used.add(l));
    return { key: `u-${u.name}-${u.startMin}`, label: u.name, ...u, lessons: inUnit };
  });
  for (const l of lessons) {
    if (used.has(l)) continue;
    const existing = rows.find((r) => r.startMin === l.startMin && r.endMin === l.endMin && r.label === '');
    if (existing) existing.lessons.push(l);
    else rows.push({ key: `x-${l.startMin}-${l.endMin}`, label: '', start: l.start, end: l.end, startMin: l.startMin, endMin: l.endMin, lessons: [l] });
  }
  return rows.sort((a, b) => a.startMin - b.startMin);
}

function DayTimeline({ status, type, moment }: { status: ElementStatus; type: ElementType; moment: EffectiveMoment }) {
  const rows = buildRows(status.timegrid, status.lessons);
  const atMin = moment.live && moment.date === status.date ? moment.atMin : status.atMin;
  const columns = COLUMNS[type];
  // Nur relevante Zeilen: von der ersten bis zur letzten Stunde des Elements
  const first = rows.findIndex((r) => r.lessons.length > 0);
  const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r.lessons.length > 0);
  const visible = first === -1 ? [] : rows.slice(first, last + 1);

  return (
    <GroupBox title="Tagesplan">
      {visible.length === 0 ? (
        <EmptyBox title="Keine Stunden" text="An diesem Tag ist nichts eingetragen." />
      ) : (
        <table className="ux-table ux-timeline">
          <thead>
            <tr>
              <th>Std.</th>
              <th>Zeit</th>
              <th>Gegenstand</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const now = atMin >= row.startMin && atMin < row.endMin;
              const past = atMin >= row.endMin;
              if (row.lessons.length === 0) {
                return (
                  <tr key={row.key} className={`ux-free-row ${now ? 'now' : ''} ${past ? 'past' : ''}`}>
                    <td>{row.label}</td>
                    <td className="ux-nowrap">
                      {row.start}–{row.end}
                    </td>
                    <td colSpan={1 + columns.length} className="ux-muted">
                      frei
                    </td>
                  </tr>
                );
              }
              return row.lessons.map((l, i) => (
                <tr key={`${row.key}-${l.id}`} className={`${now ? 'now' : ''} ${past ? 'past' : ''} ${l.status === 'cancelled' ? 'cancelled' : ''}`}>
                  {i === 0 && (
                    <>
                      <td rowSpan={row.lessons.length}>{row.label}</td>
                      <td rowSpan={row.lessons.length} className="ux-nowrap">
                        {row.start}–{row.end}
                      </td>
                    </>
                  )}
                  <td>
                    <span className="ux-subject" title={l.subjects.map((s) => s.longName).join(', ')}>
                      <RefList refs={l.subjects} type="subject" />
                    </span>{' '}
                    <LessonBadges lesson={l} />
                  </td>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <RefList refs={l[c.key]} type={c.type} names={false} />
                      {c.type === 'teacher' && l.teachers[0]?.longName && l.teachers[0].longName !== l.teachers[0].name && (
                        <span className="ux-muted ux-small"> {shortPersonName(l.teachers[0].longName)}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ));
            })}
          </tbody>
        </table>
      )}
    </GroupBox>
  );
}
