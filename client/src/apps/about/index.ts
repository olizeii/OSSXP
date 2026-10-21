import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/about.svg';

export default defineApp({
  id: 'about',
  title: 'Über OSSXP',
  description: 'Version und Informationen',
  icon,
  component: lazy(() => import('./About')),
  window: { width: 420, height: 330, resizable: false },
  placement: { desktop: true, startMenu: 'right' },
});
