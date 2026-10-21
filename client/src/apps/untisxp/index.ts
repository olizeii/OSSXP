import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/untisxp.svg';

/**
 * UntisXP – Stundenplan-Dashboard (basiert auf github.com/olizeii/UntisDashboard).
 * Nur für eingeloggte User MIT Untis-Verknüpfung – das prüft der Launcher anhand von `requires`.
 */
export default defineApp({
  id: 'untisxp',
  title: 'UntisXP',
  description: 'Stundenplan & Vertretungen',
  icon,
  component: lazy(() => import('./UntisXP')),
  window: { width: 860, height: 560, minWidth: 600, minHeight: 380 },
  requires: { auth: true, untis: true },
  placement: { desktop: true, startMenu: 'pinned' },
});
