/**
 * UntisXP – das komplette UntisDashboard im Look des XP-Explorers:
 *  - Symbolleiste mit Zurück/Vor (Verlauf), Startseite und Aktualisieren
 *  - Adressleiste mit Pfad und globaler Suche (Strg+K) über Lehrkräfte, Klassen und Räume
 *  - blauer Aufgabenbereich links mit allen Ansichten
 *  - Ansichten: Dashboard, Mein Stundenplan, Lehrkräfte, Klassen, Räume, Freie Räume, Vertretungen
 *
 * Tastatur: Strg+K = Suche · Alt+← / Alt+→ = Zurück / Vor
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { launchApp } from '../../core/launcher';
import type { AppWindowProps } from '../../core/types';
import { useAuthStore } from '../../store/authStore';
import { useWindowStore } from '../../store/windowStore';
import { UxContext, type EffectiveMoment, type UxContextValue } from './context';
import { VIEW_LABELS, formatMinutes, parseTime, useApi, useSchoolNow } from './lib';
import type { MasterData, MomentChoice, Route, View } from './types';
import { ElementPicker, Glyph, type GlyphName } from './ui';
import { Dashboard } from './views/Dashboard';
import { ElementView } from './views/ElementView';
import { FreeRooms } from './views/FreeRooms';
import { Substitutions } from './views/Substitutions';
import { Week } from './views/Week';
import '../account/account.css';
import './untisxp.css';

const NAV: { view: View; glyph: GlyphName; hint: string }[] = [
  { view: 'dashboard', glyph: 'dashboard', hint: 'Überblick über den Schultag' },
  { view: 'week', glyph: 'week', hint: 'Dein eigener Wochenplan' },
  { view: 'teacher', glyph: 'teacher', hint: 'Wo ist eine Lehrkraft gerade?' },
  { view: 'class', glyph: 'class', hint: 'Wo ist eine Klasse gerade?' },
  { view: 'room', glyph: 'room', hint: 'Belegung eines Raums' },
  { view: 'free', glyph: 'door', hint: 'Aktuell unbesetzte Räume' },
  { view: 'subst', glyph: 'swap', hint: 'Entfälle, Vertretungen, Raumänderungen' },
];

export default function UntisXP({ windowId }: AppWindowProps) {
  const untis = useAuthStore((s) => s.user?.untis);
  const [history, setHistory] = useState<{ stack: Route[]; index: number }>({ stack: [{ view: 'dashboard' }], index: 0 });
  const [moment, setMomentState] = useState<MomentChoice>({ date: null, time: null });
  const [refreshKey, setRefreshKey] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const master = useApi<MasterData>('/untis/master');
  const route = history.stack[history.index];

  // ── Zeitpunkt ──
  const now = useSchoolNow(master.data?.timezone ?? 'Europe/Vienna');
  const effective: EffectiveMoment = useMemo(() => {
    const date = moment.date ?? now.date;
    if (moment.time) return { date, atMin: parseTime(moment.time), seconds: 0, live: false, today: now.date };
    return { date, atMin: now.minutes, seconds: now.seconds, live: date === now.date, today: now.date };
  }, [moment, now]);

  // ── Navigation mit Verlauf (wie im Explorer) ──
  const navigate = useCallback((next: Route) => {
    setHistory(({ stack, index }) => {
      const cur = stack[index];
      if (cur.view === next.view && cur.id === next.id) return { stack, index };
      const trimmed = stack.slice(0, index + 1);
      return { stack: [...trimmed, next].slice(-50), index: Math.min(trimmed.length, 49) };
    });
  }, []);
  const canBack = history.index > 0;
  const canForward = history.index < history.stack.length - 1;
  const back = () => canBack && setHistory((h) => ({ ...h, index: h.index - 1 }));
  const forward = () => canForward && setHistory((h) => ({ ...h, index: h.index + 1 }));

  const ctx: UxContextValue = {
    route,
    navigate,
    moment,
    setMoment: (patch) => setMomentState((m) => ({ ...m, ...patch })),
    effective,
    master: master.data,
    masterError: master.error,
    reloadMaster: master.reload,
  };

  // Ausgewähltes Element (für Adressleiste & Titel)
  const element = useMemo(() => {
    if (!route.id || !master.data) return null;
    const list = route.view === 'teacher' ? master.data.teachers : route.view === 'class' ? master.data.classes : master.data.rooms;
    return list.find((e) => e.id === route.id) ?? null;
  }, [route, master.data]);

  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, `UntisXP – ${element ? element.name : VIEW_LABELS[route.view]}`);
  }, [windowId, route.view, element]);

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      searchRef.current?.focus();
    } else if (e.altKey && e.key === 'ArrowLeft') back();
    else if (e.altKey && e.key === 'ArrowRight') forward();
  }

  return (
    <UxContext.Provider value={ctx}>
      <div className="ux" onKeyDown={onKeyDown}>
        {/* ── Symbolleiste ── */}
        <div className="ux-toolbar">
          <ToolButton label="Zurück" icon="back" disabled={!canBack} onClick={back} />
          <ToolButton label="Vor" icon="forward" disabled={!canForward} onClick={forward} compact />
          <span className="ux-tool-sep" />
          <ToolButton label="Dashboard" icon="home" onClick={() => navigate({ view: 'dashboard' })} />
          <ToolButton
            label="Aktualisieren"
            icon="refresh"
            onClick={() => {
              master.reload();
              setRefreshKey((k) => k + 1);
            }}
          />
          <span className="ux-tool-sep" />
          <ToolButton label="Mein Stundenplan" icon="week" onClick={() => navigate({ view: 'week' })} />
        </div>

        {/* ── Adressleiste + Suche ── */}
        <div className="ux-address">
          <span className="ux-address-label">Adresse</span>
          <div className="ux-address-field">
            <Glyph name={NAV.find((n) => n.view === route.view)!.glyph} />
            <span>
              UntisXP › {VIEW_LABELS[route.view]}
              {element && (
                <>
                  {' '}› <b>{element.name}</b>
                  {element.longName && element.longName !== element.name ? ` (${element.longName})` : ''}
                </>
              )}
            </span>
          </div>
          <div className="ux-global-search">
            <ElementPicker
              inputRef={searchRef}
              types={['teacher', 'class', 'room']}
              placeholder="Suchen (Strg+K)"
              onSelect={(el) => navigate({ view: el.type as 'teacher', id: el.id })}
            />
          </div>
        </div>

        <div className="ux-main">
          {/* ── Aufgabenbereich ── */}
          <aside className="cp-taskpane xp-scroll">
            <div className="cp-box">
              <div className="cp-box-title">Ansichten</div>
              <div className="cp-box-body">
                {NAV.map((n) => (
                  <button
                    key={n.view}
                    className={`cp-task ${route.view === n.view ? 'active' : ''}`}
                    title={n.hint}
                    onClick={() => navigate({ view: n.view })}
                  >
                    <Glyph name={n.glyph} /> {VIEW_LABELS[n.view]}
                  </button>
                ))}
              </div>
            </div>

            <div className="cp-box">
              <div className="cp-box-title">Details</div>
              <div className="cp-box-body ux-box">
                {master.data ? (
                  <>
                    <b>{untis?.school ?? 'Schule'}</b>
                    <div>{master.data.mode === 'demo' ? 'Demo-Daten' : `WebUntis · ${untis?.server ?? ''}`}</div>
                    <div>
                      {master.data.teachers.length} Lehrkräfte · {master.data.classes.length} Klassen · {master.data.rooms.length} Räume
                    </div>
                    <div className="ux-muted">Angemeldet als {untis?.username}</div>
                  </>
                ) : master.error ? (
                  <span className="ux-error-text">{master.error}</span>
                ) : (
                  <span>Verbinde mit WebUntis…</span>
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

          {/* ── Inhalt ── */}
          <main className="ux-content xp-scroll" key={refreshKey}>
            {route.view === 'dashboard' && <Dashboard />}
            {route.view === 'week' && <Week />}
            {(route.view === 'teacher' || route.view === 'class' || route.view === 'room') && <ElementView key={route.view} type={route.view} />}
            {route.view === 'free' && <FreeRooms />}
            {route.view === 'subst' && <Substitutions />}
          </main>
        </div>

        <div className="xp-statusbar">
          <span>{NAV.find((n) => n.view === route.view)!.hint}</span>
          <span style={{ flex: '0 0 150px' }}>{master.data?.mode === 'demo' ? 'Demo-Daten' : 'WebUntis (live)'}</span>
          <span style={{ flex: '0 0 150px' }}>
            {effective.live ? '● Live' : 'Zeitpunkt'} · {formatMinutes(effective.atMin)}
          </span>
        </div>
      </div>
    </UxContext.Provider>
  );
}

/** XP-Symbolleisten-Button mit kleinem Icon. */
function ToolButton({
  label,
  icon,
  onClick,
  disabled,
  compact,
}: {
  label: string;
  icon: 'back' | 'forward' | 'home' | 'refresh' | 'week';
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const glyph = {
    back: <path d="M14 4 6 12l8 8V15h6V9h-6Z" fill="url(#tb-g)" stroke="#1b6d0c" />,
    forward: <path d="M10 4l8 8-8 8V15H4V9h6Z" fill="url(#tb-g)" stroke="#1b6d0c" />,
    home: (
      <>
        <path d="M3 12 12 4l9 8" fill="none" stroke="#a33" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M5.5 11v9h5v-5h3v5h5v-9L12 6Z" fill="#f7e2b8" stroke="#8a5a20" />
      </>
    ),
    refresh: (
      <>
        <path d="M19 12a7 7 0 1 1-2.2-5.1" fill="none" stroke="#2b7de0" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M14.5 3.5h4.5V8" fill="none" stroke="#2b7de0" strokeWidth="2.6" strokeLinecap="round" />
      </>
    ),
    week: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" fill="#fff" stroke="#3a62a8" />
        <rect x="3" y="5" width="18" height="5" rx="2" fill="#e8601c" />
        <path d="M6 13.5h3M10.5 13.5h3M15 13.5h3M6 17h3M10.5 17h3" stroke="#3a62a8" strokeWidth="2" />
      </>
    ),
  }[icon];
  return (
    <button className="ux-tool" onClick={onClick} disabled={disabled} title={label}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <defs>
          <radialGradient id="tb-g" cx=".4" cy=".3" r=".8">
            <stop offset="0" stopColor="#b9f59a" />
            <stop offset="1" stopColor="#2f9a18" />
          </radialGradient>
        </defs>
        {glyph}
      </svg>
      {!compact && <span>{label}</span>}
    </button>
  );
}
