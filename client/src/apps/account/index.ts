import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/account.svg';

export default defineApp({
  id: 'account',
  title: 'Benutzerkonten',
  description: 'Konto & Untis-Verknüpfung',
  icon,
  component: lazy(() => import('./Account')),
  window: { width: 640, height: 450, minWidth: 520, minHeight: 360 },
  requires: { auth: true },
  placement: { desktop: true, startMenu: 'right' },
});
