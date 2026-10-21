/**
 * Der klassische „Computer ausschalten“-Dialog (Startmenü → „Seite schließen“)
 * plus die Bildschirme für Standby, Herunterfahren und „ausgeschaltet“.
 *
 * Hinweis: Browser erlauben window.close() nur für Tabs, die per Script geöffnet wurden.
 * Deshalb endet „Ausschalten“ – wie früher bei alten PCs – auf einem Bildschirm, der sagt,
 * dass man die Seite jetzt schließen kann.
 */
import { useEffect } from 'react';
import { useUiStore } from '../../store/uiStore';
import { WinFlag } from '../xp/Glyphs';

export function ShutdownDialog() {
  const power = useUiStore((s) => s.power);
  const setPower = useUiStore((s) => s.setPower);

  // Escape = Abbrechen
  useEffect(() => {
    if (power !== 'shutdownMenu') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPower('on');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [power, setPower]);

  // Herunterfahren: kurzer „wird heruntergefahren“-Screen, dann versuchen zu schließen
  useEffect(() => {
    if (power !== 'shuttingDown') return;
    const t = setTimeout(() => {
      window.close(); // klappt nur, wenn der Tab per Script geöffnet wurde
      setPower('off');
    }, 2200);
    return () => clearTimeout(t);
  }, [power, setPower]);

  if (power === 'on') return null;

  if (power === 'standby') {
    return <div className="power-screen standby" onClick={() => setPower('on')} title="Klicken zum Aufwecken" />;
  }

  if (power === 'shuttingDown') {
    return (
      <div className="power-screen welcome">
        <div className="welcome-top" />
        <div className="welcome-center">
          <WinFlag size={64} />
          <span>Seite wird geschlossen…</span>
        </div>
        <div className="welcome-bottom" />
      </div>
    );
  }

  if (power === 'off') {
    return (
      <div className="power-screen off" onClick={() => location.reload()}>
        <p>Sie können die Seite jetzt schließen.</p>
        <small>Klicken Sie irgendwo, um OSSXP neu zu starten.</small>
      </div>
    );
  }

  // power === 'shutdownMenu'
  return (
    <div className="shutdown-overlay" onPointerDown={(e) => e.target === e.currentTarget && setPower('on')}>
      <div className="shutdown-dialog" role="dialog" aria-label="Computer ausschalten">
        <div className="sd-top">
          <span>Computer ausschalten</span>
          <WinFlag size={30} />
        </div>
        <div className="sd-middle">
          <button className="sd-option" onClick={() => setPower('standby')}>
            <span className="sd-icon standby">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path d="M8 6.5a7 7 0 1 0 8 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M12 3.5v7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span>
              S<u>t</u>andby
            </span>
          </button>
          <button className="sd-option" onClick={() => setPower('shuttingDown')} autoFocus>
            <span className="sd-icon off">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path d="M8 6.5a7 7 0 1 0 8 0" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M12 3.5v7" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
              </svg>
            </span>
            <span>
              <u>A</u>usschalten
            </span>
          </button>
          <button className="sd-option" onClick={() => location.reload()}>
            <span className="sd-icon restart">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path d="M18.5 12.5a6.5 6.5 0 1 1-2.2-4.9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M13.8 4.2h4.6v4.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span>
              <u>N</u>eu starten
            </span>
          </button>
        </div>
        <div className="sd-bottom">
          <button className="xp-button sd-cancel" onClick={() => setPower('on')}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}
