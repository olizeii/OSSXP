/**
 * Das XP-Startmenü (web-angepasst):
 *  - Kopfzeile: Benutzerbild + Name, bzw. „Anmelden“-Button für Gäste
 *  - links (weiß): angeheftete Apps (fett + Untertitel), weitere Apps, „Alle Programme“
 *  - rechts (hellblau): System-Apps & Links
 *  - Fußzeile: „Abmelden“ und „Seite schließen“ (öffnet den „Computer ausschalten“-Dialog)
 */
import { useEffect, useRef, useState } from 'react';
import { apps } from '../../apps/registry';
import { launchApp } from '../../core/launcher';
import type { AppDefinition } from '../../core/types';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { LogoffIcon, PowerIcon } from '../xp/Glyphs';
import { avatarUrl } from '../../core/avatars';
import iconHelp from '../../assets/icons/help.svg';
import iconGlobe from '../../assets/icons/globe.svg';
import iconLink from '../../assets/icons/untis-link.svg';
import { REPO_URL } from '../../core/constants';

/** Zusätzliche Einträge der rechten Spalte, die keine eigene App sind. */
interface ShellLink {
  id: string;
  label: string;
  icon: string;
  run: () => void;
}

const RIGHT_LINKS: ShellLink[] = [
  { id: 'untis-link', label: 'Untis-Verknüpfung', icon: iconLink, run: () => launchApp('account', { tab: 'untis' }) },
  { id: 'github', label: 'OSSXP auf GitHub', icon: iconGlobe, run: () => window.open(REPO_URL, '_blank', 'noopener') },
  { id: 'help', label: 'Hilfe und Support', icon: iconHelp, run: () => launchApp('about') },
];

export function StartMenu() {
  const open = useUiStore((s) => s.startMenuOpen);
  const close = useUiStore((s) => s.closeStartMenu);
  const user = useAuthStore((s) => s.user);
  const ref = useRef<HTMLDivElement>(null);
  const [allProgramsOpen, setAllProgramsOpen] = useState(false);

  // Klick außerhalb oder Escape schließt das Menü
  useEffect(() => {
    if (!open) {
      setAllProgramsOpen(false);
      return;
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!ref.current?.contains(t) && !t.closest('[data-start-button]')) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  if (!open) return null;

  const pinned = apps.filter((a) => a.placement?.startMenu === 'pinned');
  const left = apps.filter((a) => a.placement?.startMenu === 'left');
  const right = apps.filter((a) => a.placement?.startMenu === 'right');
  const all = apps.filter((a) => a.placement?.allPrograms !== false);

  const ui = useUiStore.getState();

  return (
    <div className="start-menu" ref={ref} role="menu">
      {/* ── Kopf ── */}
      <header className="sm-header">
        <button
          className="sm-user"
          // Wie unter XP: Klick auf das eigene Bild öffnet „Eigenes Bild ändern“
          onClick={() => (user ? launchApp('account', { tab: 'picture' }) : ui.openLogin())}
          title={user ? 'Eigenes Bild ändern' : 'Mit eigenem OSSXP-Konto anmelden'}
        >
          <img className="sm-avatar" src={avatarUrl(user?.avatar)} alt="" />
          <span className="sm-user-text">
            <span className="sm-username">{user ? user.username : 'Anmelden'}</span>
            {!user && <span className="sm-user-hint">Klicken Sie hier, um sich anzumelden</span>}
          </span>
        </button>
      </header>
      <div className="sm-orange-line" />

      {/* ── Spalten ── */}
      <div className="sm-columns">
        <div className="sm-left">
          {pinned.map((app) => (
            <MenuItem key={app.id} app={app} pinned />
          ))}
          {left.length > 0 && <hr className="sm-sep" />}
          {left.map((app) => (
            <MenuItem key={app.id} app={app} />
          ))}

          <div className="sm-spacer" />
          <hr className="sm-sep" />
          <button
            className={`sm-all-programs ${allProgramsOpen ? 'hover' : ''}`}
            onMouseEnter={() => setAllProgramsOpen(true)}
            onClick={() => setAllProgramsOpen((v) => !v)}
          >
            <span>
              <u>A</u>lle Programme
            </span>
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
              <defs>
                <linearGradient id="ap-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8ee36d" />
                  <stop offset="1" stopColor="#2a9a16" />
                </linearGradient>
              </defs>
              <rect x="1" y="1" width="18" height="18" rx="3" fill="url(#ap-g)" stroke="#fff" />
              <path d="M7.5 5l6 5-6 5Z" fill="#fff" />
            </svg>
          </button>

          {allProgramsOpen && (
            <div className="sm-flyout" role="menu" onMouseLeave={() => setAllProgramsOpen(false)}>
              {all.map((app) => (
                <button key={app.id} className="sm-flyout-item" onClick={() => launchApp(app.id)}>
                  <img src={app.icon} alt="" />
                  <span>{app.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sm-right" onMouseEnter={() => setAllProgramsOpen(false)}>
          {right.map((app) => (
            <button key={app.id} className="sm-right-item bold" onClick={() => launchApp(app.id)}>
              <img src={app.icon} alt="" />
              <span>{app.title}</span>
            </button>
          ))}
          <hr className="sm-sep blue" />
          {RIGHT_LINKS.map((link) => (
            <button
              key={link.id}
              className="sm-right-item"
              onClick={() => {
                close();
                link.run();
              }}
            >
              <img src={link.icon} alt="" />
              <span>{link.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Fuß ── */}
      <footer className="sm-footer">
        {user && (
          <button
            className="sm-footer-btn"
            onClick={() => {
              close();
              useAuthStore.getState().logout();
            }}
          >
            <LogoffIcon />
            <span>
              <u>A</u>bmelden
            </span>
          </button>
        )}
        <button className="sm-footer-btn" onClick={() => ui.setPower('shutdownMenu')}>
          <PowerIcon />
          <span>
            Seite s<u>c</u>hließen
          </span>
        </button>
      </footer>
    </div>
  );
}

function MenuItem({ app, pinned }: { app: AppDefinition; pinned?: boolean }) {
  return (
    <button className={`sm-item ${pinned ? 'pinned' : ''}`} onClick={() => launchApp(app.id)}>
      <img src={app.icon} alt="" />
      <span className="sm-item-text">
        <span className="sm-item-title">{app.title}</span>
        {pinned && app.description && <span className="sm-item-desc">{app.description}</span>}
      </span>
    </button>
  );
}
