/**
 * „Über OSSXP“ – im Stil des XP-Dialogs „Info über Windows“ (winver).
 * Gleichzeitig das einfachste Beispiel für eine OSSXP-App.
 */
import { apps } from '../registry';
import { WinFlag } from '../../components/xp/Glyphs';
import { REPO_URL, VERSION } from '../../core/constants';
import type { AppWindowProps } from '../../core/types';
import { useWindowStore } from '../../store/windowStore';

export default function About({ windowId }: AppWindowProps) {
  return (
    <div className="about">
      <div className="login-banner" style={{ height: 64 }}>
        <div className="login-banner-brand">
          <WinFlag size={30} />
          <div>
            <div className="login-banner-title" style={{ fontSize: 22 }}>
              OSSXP<sup>®</sup>
            </div>
            <div className="login-banner-sub">Web Edition</div>
          </div>
        </div>
        <div className="login-banner-stripe" />
      </div>

      <div className="about-body selectable">
        <p>
          <b>OSSXP</b> Version {VERSION}
          <br />
          Eine Web-Desktop-Umgebung im Windows-XP-Design.
        </p>
        <p>Installierte Programme:</p>
        <ul>
          {apps.map((a) => (
            <li key={a.id}>
              <img src={a.icon} alt="" /> {a.title}
            </li>
          ))}
        </ul>
        <p>
          Quellcode:{' '}
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {REPO_URL.replace('https://', '')}
          </a>
        </p>
        <p className="about-note">Kein Produkt der Microsoft Corporation. Windows XP ist eine Marke von Microsoft.</p>
      </div>

      <div className="dialog-buttons" style={{ justifyContent: 'flex-end' }}>
        <button className="xp-button default" onClick={() => useWindowStore.getState().close(windowId)}>
          OK
        </button>
      </div>

      <style>{`
        .about { display: flex; flex-direction: column; height: 100%; }
        .about-body { flex: 1; padding: 6px 16px; overflow: auto; }
        .about-body p { margin: 6px 0; }
        .about-body ul { margin: 0; padding-left: 18px; list-style: none; }
        .about-body li { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
        .about-body li img { width: 16px; height: 16px; }
        .about-note { color: #777; }
      `}</style>
    </div>
  );
}
