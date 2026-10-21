/**
 * Die blaue XP-Taskleiste: Start-Button, Schnellstart, Fenster-Buttons, Infobereich mit Uhr.
 */
import { useEffect, useState } from 'react';
import { apps } from '../../apps/registry';
import { launchApp } from '../../core/launcher';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import { WinFlag } from '../xp/Glyphs';

export function Taskbar() {
  const windows = useWindowStore((s) => s.windows);
  const activeId = useWindowStore((s) => s.activeId);
  const toggleFromTaskbar = useWindowStore((s) => s.toggleFromTaskbar);
  const startMenuOpen = useUiStore((s) => s.startMenuOpen);
  const toggleStartMenu = useUiStore((s) => s.toggleStartMenu);

  const quickLaunch = apps.filter((a) => a.placement?.startMenu === 'pinned');

  return (
    <footer className="taskbar">
      <button
        className={`start-button ${startMenuOpen ? 'pressed' : ''}`}
        data-start-button
        onClick={toggleStartMenu}
        aria-expanded={startMenuOpen}
      >
        <WinFlag size={22} />
        <span>start</span>
      </button>

      <div className="quick-launch">
        {quickLaunch.map((app) => (
          <button key={app.id} title={app.title} onClick={() => launchApp(app.id)}>
            <img src={app.icon} alt={app.title} />
          </button>
        ))}
      </div>

      <div className="task-buttons">
        {windows.map((w) => (
          <button
            key={w.id}
            className={`task-button ${w.id === activeId && !w.minimized ? 'active' : ''}`}
            onClick={() => toggleFromTaskbar(w.id)}
            title={w.title}
          >
            <img src={w.icon} alt="" />
            <span>{w.title}</span>
          </button>
        ))}
      </div>

      <SystemTray />
    </footer>
  );
}

function SystemTray() {
  const user = useAuthStore((s) => s.user);
  const now = useClock();

  return (
    <div className="tray">
      <button
        className="tray-icon"
        title={user ? `Angemeldet als ${user.username}` : 'Nicht angemeldet – klicken zum Anmelden'}
        onClick={() => (user ? launchApp('account') : useUiStore.getState().openLogin())}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="5" r="3.2" fill={user ? '#4fb34a' : '#9aa7bd'} stroke="#fff" strokeWidth=".8" />
          <path d="M2 15c.5-3.6 3-5.3 6-5.3s5.5 1.7 6 5.3Z" fill={user ? '#2f7fd8' : '#7d8aa3'} stroke="#fff" strokeWidth=".8" />
        </svg>
      </button>
      <time
        className="tray-clock"
        title={now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      >
        {now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
      </time>
    </div>
  );
}

/** Aktualisiert sich zu jeder vollen Minute. */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  return now;
}
