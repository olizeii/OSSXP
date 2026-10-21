import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/mollyxp.svg';

/**
 * MollyXP – Tests & Mitschriften pro Schule und Klasse. Ansehen ohne Login,
 * Hochladen nur mit Untis-Verknüpfung in die eigene (von Untis bestätigte) Klasse.
 */
export default defineApp({
  id: 'mollyxp',
  title: 'MollyXP',
  description: 'Tests & Mitschriften teilen',
  icon,
  component: lazy(() => import('./MollyXP')),
  window: { width: 860, height: 560, minWidth: 560, minHeight: 360 },
  placement: { desktop: true, startMenu: 'pinned' },
});
