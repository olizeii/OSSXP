/** Profilfenster eines beliebigen Users (geöffnet über openProfile(username)). */
import { useEffect } from 'react';
import type { AppWindowProps } from '../../core/types';
import { useAuthStore } from '../../store/authStore';
import { useWindowStore } from '../../store/windowStore';
import { ProfileView } from './ProfileView';

export default function Profile({ windowId, params }: AppWindowProps) {
  const me = useAuthStore((s) => s.user?.username);
  const username = String(params?.username ?? me ?? '');

  useEffect(() => {
    useWindowStore.getState().setTitle(windowId, username ? `Profil – ${username}` : 'Profil');
  }, [windowId, username]);

  if (!username) return <div className="xp-loading">Melden Sie sich an, um Ihr Profil zu sehen.</div>;
  return <ProfileView key={username} username={username} />;
}
