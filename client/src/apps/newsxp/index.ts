import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/newsxp.svg';

/** NewsXP – News & Poster der Schule. Lesen für alle, veröffentlichen nur für Admins. */
export default defineApp({
  id: 'newsxp',
  title: 'NewsXP',
  description: 'Neuigkeiten der Schule',
  icon,
  component: lazy(() => import('./NewsXP')),
  window: { width: 760, height: 520, minWidth: 480, minHeight: 320 },
  placement: { desktop: true, startMenu: 'left' },
});
