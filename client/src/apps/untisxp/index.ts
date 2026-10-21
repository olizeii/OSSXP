import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/untisxp.svg';

/**
 * UntisXP – das UntisDashboard (github.com/olizeii/UntisDashboard) im XP-Explorer-Look:
 * Dashboard, Lehrer-/Klassen-/Raumsuche mit Live-Status, freie Räume, Vertretungsplan, eigener Stundenplan.
 * Nur für eingeloggte User MIT Untis-Verknüpfung – das prüft der Launcher anhand von `requires`.
 */
export default defineApp({
  id: 'untisxp',
  title: 'UntisXP',
  description: 'Wo ist …? · Vertretungen',
  icon,
  component: lazy(() => import('./UntisXP')),
  window: { width: 1000, height: 660, minWidth: 640, minHeight: 420 },
  requires: { auth: true, untis: true },
  placement: { desktop: true, startMenu: 'pinned' },
});
