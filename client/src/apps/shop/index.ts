import { lazy } from 'react';
import { defineApp } from '../../core/types';
import icon from '../../assets/icons/shop.svg';

/** Punkteshop: Coins gegen Profil-Hintergründe und Avatar-Rahmen tauschen. */
export default defineApp({
  id: 'shop',
  title: 'Punkteshop',
  description: 'Profil mit Coins aufwerten',
  icon,
  component: lazy(() => import('./Shop')),
  window: { width: 760, height: 520, minWidth: 520, minHeight: 360 },
  placement: { desktop: true, startMenu: 'right' },
});
