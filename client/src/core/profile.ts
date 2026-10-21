/**
 * Öffnet das Profilfenster eines Users – aus jeder App (Chat, redXP, Scoreboard, MollyXP …).
 * Pro User gibt es höchstens ein Fenster; ein erneuter Klick holt es nach vorne.
 */
import { useWindowStore } from '../store/windowStore';
import { launchApp } from './launcher';

export function openProfile(username: string) {
  const store = useWindowStore.getState();
  const existing = store.windows.find(
    (w) => w.appId === 'profile' && String(w.params?.username ?? '').toLowerCase() === username.toLowerCase(),
  );
  if (existing) store.focus(existing.id);
  else launchApp('profile', { username });
}
