/**
 * Die OSSXP-Shell: Desktop + Fenster + Taskleiste + Startmenü + Dialoge.
 */
import { useEffect, useState } from 'react';
import { Desktop } from './components/desktop/Desktop';
import { LoginDialog } from './components/dialogs/LoginDialog';
import { MessageBoxLayer } from './components/dialogs/MessageBoxLayer';
import { ShutdownDialog } from './components/dialogs/ShutdownDialog';
import { StartMenu } from './components/startmenu/StartMenu';
import { Taskbar } from './components/taskbar/Taskbar';
import { WindowManager } from './components/window/WindowManager';
import { WinFlag } from './components/xp/Glyphs';
import { Clippy } from './components/clippy/Clippy';
import { enforceRequirements } from './core/launcher';
import { getSocket, reconnectSocket } from './core/socket';
import { useAuthStore } from './store/authStore';
import { initEconomy } from './store/economyStore';

/** Mindestdauer des Boot-Screens – gerade lang genug für Nostalgie. */
const BOOT_MS = 1400;

export default function App() {
  const status = useAuthStore((s) => s.status);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    useAuthStore.getState().fetchMe();
    const t = setTimeout(() => setBootDone(true), BOOT_MS);

    // Gemeinsame Echtzeit-Verbindung (Chat + Live-Updates für Coins/Level/Abzeichen)
    getSocket();
    const stopEconomy = initEconomy();

    const unsubscribe = useAuthStore.subscribe((state, prev) => {
      // Fenster schließen, deren Voraussetzungen nicht mehr erfüllt sind (Abmelden, Untis entknüpft …)
      if (state.user !== prev.user) enforceRequirements(state.user);
      // Anderer User → Socket neu verbinden, damit der Server das neue Cookie kennt
      if (state.user?.id !== prev.user?.id) reconnectSocket();
    });
    return () => {
      clearTimeout(t);
      unsubscribe();
      stopEconomy();
    };
  }, []);

  const booting = !bootDone || status === 'loading';

  return (
    <div className="shell">
      <Desktop />
      <WindowManager />
      <Clippy />
      <LoginDialog />
      <MessageBoxLayer />
      <StartMenu />
      <Taskbar />
      <ShutdownDialog />
      <BootScreen fading={!booting} />
    </div>
  );
}

function BootScreen({ fading }: { fading: boolean }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [fading]);
  if (gone) return null;

  return (
    <div className={`boot-screen ${fading ? 'fade' : ''}`} aria-hidden>
      <div className="boot-logo">
        <div className="boot-brand">
          <WinFlag size={56} />
          <span>
            OSSXP<sup>xp</sup>
          </span>
        </div>
        <div className="boot-progress">
          <span />
        </div>
      </div>
    </div>
  );
}
