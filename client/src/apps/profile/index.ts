import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/profile.svg';

/**
 * Profilfenster (Steam-ähnlich). Wird meist über openProfile(username) geöffnet –
 * z. B. per Klick auf einen Namen im Chat, in redXP oder auf der Sudoku-Bestenliste.
 * Ohne Parameter zeigt es das eigene Profil.
 */
export default defineApp({
  id: 'profile',
  title: 'Profil',
  description: 'Level, Abzeichen & Vitrine',
  icon,
  component: lazy(() => import('./Profile')),
  window: { width: 720, height: 560, minWidth: 420, minHeight: 360 },
  singleInstance: false,
  placement: { desktop: false, startMenu: false, allPrograms: false },
});
