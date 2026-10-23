/**
 * Profilfenster – ohne Parameter das eigene Profil (Desktop-Icon „Profil“),
 * mit { username } das Profil einer anderen Person (Klick auf einen Namen in Chat, redXP …).
 */
import { useEffect } from 'react';
import type { AppWindowProps } from '../../core/types';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { useWindowStore } from '../../store/windowStore';
import { ProfileView } from './ProfileView';

export default function Profile({ windowId, params }: AppWindowProps) {
  const me = useAuthStore((s) => s.user?.username);
  const username = String(params?.username ?? me ?? '');

  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, username ? `Profil – ${username}` : 'Profil');
  }, [windowId, username]);

  if (!username) {
    return (
      <div className="xp-loading" style={{ flexDirection: 'column', gap: 10, display: 'flex' }}>
        <span>Melde dich an, um dein Profil zu sehen und anzupassen.</span>
        <button className="xp-button default" onClick={() => useUiStore.getState().openLogin()}>
          Anmelden
        </button>
      </div>
    );
  }
  return <ProfileView key={username} username={username} />;
}
