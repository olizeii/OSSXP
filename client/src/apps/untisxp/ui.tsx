/**
 * Wiederverwendbare XP-Bausteine für UntisXP.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useUx } from './context';
import { ELEMENT_LABELS, SUBST_META, addDays, formatLongDate, formatMinutes, lessonChangeTypes, shortPersonName, type Tone } from './lib';
import type { ElementRef, ElementType, Lesson, SubstitutionType, UntisElement } from './types';

// ─── Symbole (kleine XP-artige Inline-SVGs) ────────────────────────────────

export type GlyphName = 'dashboard' | 'week' | 'teacher' | 'class' | 'room' | 'door' | 'swap' | 'search' | 'live';

export function Glyph({ name, size = 16 }: { name: GlyphName; size?: number }) {
  const body: Record<GlyphName, ReactNode> = {
    dashboard: (
      <>
        <rect x="1.5" y="1.5" width="6" height="7" rx="1" fill="#4f8de8" stroke="#1d4fa8" />
        <rect x="8.5" y="1.5" width="6" height="4" rx="1" fill="#62bb46" stroke="#2f7a16" />
        <rect x="8.5" y="6.5" width="6" height="8" rx="1" fill="#f2b530" stroke="#a87300" />
        <rect x="1.5" y="9.5" width="6" height="5" rx="1" fill="#e05a5a" stroke="#9e1d1d" />
      </>
    ),
    week: (
      <>
        <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="#fff" stroke="#3a62a8" />
        <rect x="1.5" y="2.5" width="13" height="3.5" rx="1.5" fill="#e8601c" />
        <path d="M4 8.5h2M7 8.5h2M10 8.5h2M4 11.5h2M7 11.5h2" stroke="#3a62a8" strokeWidth="1.6" />
      </>
    ),
    teacher: (
      <>
        <circle cx="8" cy="5" r="3.2" fill="#f7d2b0" stroke="#8a5220" />
        <path d="M2 15c.4-3.6 2.8-5.6 6-5.6s5.6 2 6 5.6Z" fill="#2f7fd8" stroke="#1b4c8c" />
        <path d="M6.5 9.6 8 12l1.5-2.4" fill="#fff" />
      </>
    ),
    class: (
      <>
        <circle cx="5" cy="5.5" r="2.4" fill="#f7d2b0" stroke="#8a5220" />
        <circle cx="11" cy="5.5" r="2.4" fill="#ffe0c0" stroke="#8a5220" />
        <path d="M.8 14c.3-3 2-4.6 4.2-4.6S8.9 11 9.2 14Z" fill="#62bb46" stroke="#2f7a16" />
        <path d="M6.8 14c.3-3 2-4.6 4.2-4.6s3.9 1.6 4.2 4.6Z" fill="#f08a2a" stroke="#a84b00" />
      </>
    ),
    room: (
      <>
        <path d="M8 1.5c-3 0-5 2.2-5 5 0 3.6 5 8 5 8s5-4.4 5-8c0-2.8-2-5-5-5Z" fill="#e0453a" stroke="#8c1a12" />
        <circle cx="8" cy="6.5" r="1.9" fill="#fff" />
      </>
    ),
    door: (
      <>
        <rect x="3" y="1.5" width="10" height="13.5" fill="#c58a4a" stroke="#6b3e12" />
        <path d="M3 1.5l6 1.6v12.4L3 15Z" fill="#e3a964" stroke="#6b3e12" />
        <circle cx="7.6" cy="8.6" r=".8" fill="#ffe27a" />
      </>
    ),
    swap: (
      <>
        <path d="M2 5h9.5l-2.5-2.5M14 11H4.5L7 13.5" fill="none" stroke="#2b7de0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    search: (
      <>
        <circle cx="6.5" cy="6.5" r="4.3" fill="#d6ecff" stroke="#355f9e" strokeWidth="1.6" />
        <path d="M9.7 9.7 14 14" stroke="#7a5a2a" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
    live: <circle cx="8" cy="8" r="4.5" fill="#2fbf3a" stroke="#1a7a22" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden className="ux-glyph">
      {body[name]}
    </svg>
  );
}

// ─── Container ─────────────────────────────────────────────────────────────

/** XP-Gruppenfeld mit blauer Überschrift (wie in den Systemsteuerungs-Dialogen). */
export function GroupBox({ title, action, children, className = '' }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ux-group ${className}`}>
      <header className="ux-group-head">
        <h3>{title}</h3>
        {action}
      </header>
      <div className="ux-group-body">{children}</div>
    </section>
  );
}

/** Grüner XP-Fortschrittsbalken aus Blöcken. */
export function XpProgress({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="ux-progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="ux-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Badge({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`ux-badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export const SubstBadge = ({ type }: { type: SubstitutionType }) => <Badge tone={SUBST_META[type].tone}>{SUBST_META[type].label}</Badge>;

export function LessonBadges({ lesson }: { lesson: Lesson }) {
  const types = lessonChangeTypes(lesson);
  if (types.length === 0) return null;
  return (
    <span className="ux-badges">
      {types.map((t) => (
        <SubstBadge key={t} type={t} />
      ))}
    </span>
  );
}

export function LoadingBox({ text = 'Daten werden von WebUntis geladen…' }: { text?: string }) {
  return (
    <div className="ux-state">
      <div className="ux-spinner" />
      <span>{text}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="ux-state error">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="14" fill="#e0453a" stroke="#8c1a12" />
        <path d="M11 11l10 10M21 11 11 21" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div>
        <b>Die Daten konnten nicht geladen werden.</b>
        <p>{error}</p>
        {onRetry && (
          <button className="xp-button" onClick={onRetry}>
            Erneut versuchen
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyBox({ title, text }: { title: string; text?: string }) {
  return (
    <div className="ux-state">
      <b>{title}</b>
      {text && <span>{text}</span>}
    </div>
  );
}

// ─── Verlinkte Element-Listen ──────────────────────────────────────────────

/**
 * Lehrkräfte/Klassen/Räume als Links (Klick öffnet deren Ansicht).
 * Geänderte Elemente zeigen das ursprüngliche durchgestrichen.
 */
export function RefList({ refs, type, names = type === 'teacher', long = false }: { refs: ElementRef[]; type: ElementType; names?: boolean; long?: boolean }) {
  const { navigate } = useUx();
  if (refs.length === 0) return <span className="ux-muted">–</span>;
  const linkable = type === 'teacher' || type === 'class' || type === 'room';
  return (
    <span className="ux-refs">
      {refs.map((r, i) => (
        <span key={`${r.id}-${i}`} className="ux-ref">
          {r.original && <s className="ux-muted">{r.original.name}</s>}
          {linkable ? (
            <button className="ux-link" title={r.longName} onClick={() => navigate({ view: type, id: r.id })}>
              {long && r.longName ? r.longName : r.name}
            </button>
          ) : (
            <span title={r.longName}>{long && r.longName ? r.longName : r.name}</span>
          )}
          {names && !long && r.longName && r.longName !== r.name && <span className="ux-muted">{shortPersonName(r.longName)}</span>}
          {i < refs.length - 1 && <span className="ux-muted">,</span>}
        </span>
      ))}
    </span>
  );
}

// ─── Datum / Uhrzeit ───────────────────────────────────────────────────────

/** Tag zurück/vor, Datum, Uhrzeit und „Jetzt“ – leere Uhrzeit = live (folgt der Uhr). */
export function MomentBar({ showTime = true }: { showTime?: boolean }) {
  const { moment, setMoment, effective } = useUx();
  const setDate = (value: string) => setMoment({ date: value && value !== effective.today ? value : null });

  return (
    <div className="ux-moment">
      <button className="xp-button ux-icon-btn" title="Vorheriger Tag" onClick={() => setDate(addDays(effective.date, -1))}>
        ◄
      </button>
      <input className="xp-input" type="date" aria-label="Datum" value={effective.date} onChange={(e) => setDate(e.target.value)} />
      <button className="xp-button ux-icon-btn" title="Nächster Tag" onClick={() => setDate(addDays(effective.date, 1))}>
        ►
      </button>
      {showTime && (
        <input
          className="xp-input"
          type="time"
          aria-label="Uhrzeit"
          value={moment.time ?? formatMinutes(effective.atMin)}
          onChange={(e) => setMoment({ time: e.target.value || null })}
        />
      )}
      <button
        className={`xp-button ${effective.live ? 'ux-live-on' : ''}`}
        disabled={effective.live}
        onClick={() => setMoment({ date: null, time: null })}
        title="Zurück zu jetzt"
      >
        <Glyph name="live" size={10} /> {effective.live ? 'Live' : 'Jetzt'}
      </button>
      <span className="ux-moment-label">
        {formatLongDate(effective.date)}
        {effective.date === effective.today ? ' (heute)' : ''}
      </span>
    </div>
  );
}

// ─── Suche (Kombinationsfeld) ──────────────────────────────────────────────

/**
 * Suchfeld mit Vorschlagsliste über Lehrkräfte, Klassen und/oder Räume.
 * Tastatur: ↑/↓ wählen, Enter öffnen, Esc schließen.
 */
export function ElementPicker({
  types,
  placeholder,
  onSelect,
  autoFocus,
  inputRef,
}: {
  types: ElementType[];
  placeholder: string;
  onSelect: (el: UntisElement) => void;
  autoFocus?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const { master } = useUx();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    if (!master) return [];
    const q = query.trim().toLowerCase();
    const all = types.flatMap((t) => (t === 'teacher' ? master.teachers : t === 'class' ? master.classes : t === 'room' ? master.rooms : []));
    const scored = all
      .map((e) => {
        const name = e.name.toLowerCase();
        const long = (e.longName ?? '').toLowerCase();
        const score = !q ? 3 : name === q ? 0 : name.startsWith(q) ? 1 : long.includes(q) || name.includes(q) ? 2 : -1;
        return { e, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || a.e.name.localeCompare(b.e.name, 'de', { numeric: true }));
    return scored.slice(0, 60).map((x) => x.e);
  }, [master, query, types]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  function choose(el: UntisElement) {
    onSelect(el);
    setQuery('');
    setOpen(false);
    ref.current?.blur();
  }

  return (
    <div className="ux-picker" ref={wrapRef}>
      <Glyph name="search" />
      <input
        ref={ref}
        className="xp-input"
        value={query}
        placeholder={master ? placeholder : 'Stammdaten werden geladen…'}
        disabled={!master}
        autoFocus={autoFocus}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)));
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)));
          else if (e.key === 'Enter' && results[active]) choose(results[active]);
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && master && (
        <ul className="ux-picker-list" role="listbox">
          {results.length === 0 && <li className="ux-muted">Keine Treffer</li>}
          {results.map((el, i) => (
            <li
              key={`${el.type}-${el.id}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onPointerDown={(e) => (e.preventDefault(), choose(el))}
              onMouseEnter={() => setActive(i)}
            >
              <Glyph name={el.type === 'teacher' ? 'teacher' : el.type === 'class' ? 'class' : 'room'} />
              <b>{el.name}</b>
              <span className="ux-muted">{el.longName && el.longName !== el.name ? el.longName : ''}</span>
              {types.length > 1 && <span className="ux-picker-type">{ELEMENT_LABELS[el.type].singular}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
