import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/account.svg';

export default defineApp({
  id: 'account',
  title: 'Benutzerkonten',
  description: 'Profil, Abzeichen & Untis-Verknüpfung',
  icon,
  component: lazy(() => import('./Account')),
  window: { width: 860, height: 580, minWidth: 560, minHeight: 380 },
  requires: { auth: true },
  // Auf dem Desktop steht stattdessen „Profil“; die Kontoeinstellungen bleiben im Startmenü
  placement: { desktop: false, startMenu: 'right' },
});
