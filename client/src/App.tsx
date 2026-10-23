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
import { enforceRequirements, launchApp } from './core/launcher';
import { useUiStore } from './store/uiStore';
import { useWindowStore } from './store/windowStore';
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
    const socket = getSocket();
    const stopEconomy = initEconomy();

    // Rang geändert (z. B. zum Moderator ernannt) → Profil neu laden
    socket.on('account:update', () => useAuthStore.getState().fetchMe());

    // Privatnachricht, während der Chat nicht im Vordergrund ist → Sprechblase am Infobereich
    socket.on('dm:message', (m: { from: string; text: string }) => {
      if (m.from === useAuthStore.getState().user?.username) return;
      const { windows, activeId } = useWindowStore.getState();
      const chat = windows.find((w) => w.appId === 'chatterinoxp');
      if (chat && chat.id === activeId && !chat.minimized) return;
      useUiStore.getState().notify({ title: `Nachricht von ${m.from}`, text: m.text.length > 80 ? `${m.text.slice(0, 80)}…` : m.text, icon: 'info' });
    });

    // Shop-Einreichung geprüft → Ersteller:in benachrichtigen
    socket.on('shop:review', (r: { name: string; approved: boolean }) =>
      useUiStore.getState().notify({
        title: r.approved ? 'Artikel freigegeben' : 'Einreichung abgelehnt',
        text: r.approved ? `„${r.name}“ ist jetzt im Workshop kaufbar.` : `„${r.name}“ wurde von der Moderation abgelehnt.`,
        icon: 'info',
      }),
    );

    // Deep-Links: ?app=redxp&sub=3ahit öffnet die App mit diesen Parametern (z. B. private Subreddits teilen)
    const query = new URLSearchParams(location.search);
    const deepApp = query.get('app');
    if (deepApp) {
      query.delete('app');
      const params = Object.fromEntries(query);
      history.replaceState(null, '', location.pathname);
      setTimeout(() => launchApp(deepApp, params), BOOT_MS + 300);
    }

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
