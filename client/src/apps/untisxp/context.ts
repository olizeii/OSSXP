/**
 * Gemeinsamer Zustand der UntisXP-Ansichten: aktuelle Ansicht (mit Zurück/Vor-Verlauf),
 * gewählter Zeitpunkt, Stammdaten und die tickende Schulzeit.
 */
import { createContext, useContext } from 'react';
import type { MasterData, MomentChoice, Route } from './types';

export interface EffectiveMoment {
  date: string;
  atMin: number;
  /** Sekunden innerhalb der Minute – nur live sinnvoll */
  seconds: number;
  live: boolean;
  today: string;
}

export interface UxContextValue {
  route: Route;
  navigate: (route: Route) => void;
  moment: MomentChoice;
  setMoment: (patch: Partial<MomentChoice>) => void;
  effective: EffectiveMoment;
  master?: MasterData;
  masterError?: string;
  reloadMaster: () => void;
}

export const UxContext = createContext<UxContextValue | null>(null);

export function useUx() {
  const ctx = useContext(UxContext);
  if (!ctx) throw new Error('useUx() außerhalb von UntisXP');
  return ctx;
}
