import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/profile.svg';

/**
 * Profilfenster (Steam-ähnlich). Das Desktop-Icon öffnet das eigene Profil, openProfile(username)
 * öffnet das Profil anderer – z. B. per Klick auf einen Namen im Chat, in redXP oder auf der Bestenliste.
 */
export default defineApp({
  id: 'profile',
  title: 'Profil',
  description: 'Level, Abzeichen & Vitrinen',
  icon,
  component: lazy(() => import('./Profile')),
  window: { width: 780, height: 600, minWidth: 420, minHeight: 360 },
  singleInstance: false,
  // Ein Fenster pro Profil (ohne Parameter = eigenes Profil)
  instanceKey: (params) => String(params?.username ?? '').toLowerCase(),
  placement: { desktop: true, startMenu: 'right' },
});
