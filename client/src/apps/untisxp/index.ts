import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/untisxp.svg';

/**
 * UtisXP – das UntisDashboard (github.com/olizeii/UntisDashboard) im XP-Explorer-Look:
 * Schüler-Dashboard „Mein Tag“, Lehrer-/Klassen-/Raumsuche mit Live-Status, freie Räume,
 * Vertretungsplan, eigener Stundenplan.
 * Nur für eingeloggte User MIT Untis-Verknüpfung – das prüft der Launcher anhand von `requires`.
 * (Die interne ID bleibt „untisxp“, damit gespeicherte Fensterpositionen erhalten bleiben.)
 */
export default defineApp({
  id: 'untisxp',
  title: 'UtisXP',
  description: 'Mein Tag · Tests · Wo ist …?',
  icon,
  component: lazy(() => import('./UntisXP')),
  window: { width: 1000, height: 660, minWidth: 640, minHeight: 420 },
  requires: { auth: true, untis: true },
  placement: { desktop: true, startMenu: 'pinned' },
});
