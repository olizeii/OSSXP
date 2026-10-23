/**
 * Das zentrale App-Interface von OSSXP.
 *
 * Jede App ist ein Objekt vom Typ `AppDefinition`, das in `src/apps/registry.ts`
 * in ein Array eingetragen wird. Desktop, Startmenü, Taskleiste, Window-Manager und
 * Zugriffsschutz lesen ausschließlich aus dieser Registry – eine neue App braucht
 * also KEINE Änderungen am Kern.
 */
import type { ComponentType, LazyExoticComponent } from 'react';

/** Props, die jede App-Komponente vom Window-Manager bekommt. */
export interface AppWindowProps {
  /** ID des Fensters, in dem die App läuft (z. B. für useWindowStore().setTitle). */
  windowId: string;
  /** Optionale Start-Parameter, z. B. { tab: 'untis' } – siehe launchApp(appId, params). */
  params?: Record<string, unknown>;
}

export type AppComponent =
  | ComponentType<AppWindowProps>
  | LazyExoticComponent<ComponentType<AppWindowProps>>;

/** Zugriffsvoraussetzungen – werden vom Launcher geprüft, bevor ein Fenster öffnet. */
export interface AppRequirements {
  /** User muss auf der Webseite eingeloggt sein. */
  auth?: boolean;
  /** Account muss zusätzlich mit Untis verknüpft sein (impliziert auth). */
  untis?: boolean;
}

export interface AppWindowOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  /** false = feste Größe, kein Maximieren (wie XP-Dialoge). */
  resizable?: boolean;
  /** Direkt maximiert starten. */
  maximized?: boolean;
}

export interface AppPlacement {
  /** Icon auf dem Desktop anzeigen (Standard: true). */
  desktop?: boolean;
  /**
   * Position im Startmenü:
   *  - 'pinned' → oben links, fett mit Untertitel (wie „Internet“/„E-Mail“)
   *  - 'left'   → linke Spalte unter dem Trenner
   *  - 'right'  → hellblaue rechte Spalte (wie „Arbeitsplatz“, „Systemsteuerung“)
   *  - false    → nicht im Startmenü
   */
  startMenu?: 'pinned' | 'left' | 'right' | false;
  /** In „Alle Programme“ auflisten (Standard: true). */
  allPrograms?: boolean;
}

export interface AppDefinition {
  /** Eindeutige, stabile ID (wird auch für gespeicherte Fensterpositionen genutzt). */
  id: string;
  /** Angezeigter Name (Desktop, Taskleiste, Titelleiste). */
  title: string;
  /** Untertitel im Startmenü (grauer Text unter „pinned“-Einträgen). */
  description?: string;
  /** URL des Icons (SVG/PNG, idealerweise 48×48 im XP-Stil). */
  icon: string;
  /** Die React-Komponente der App – gerne per React.lazy() für Code-Splitting. */
  component: AppComponent;
  window?: AppWindowOptions;
  requires?: AppRequirements;
  /** Nur ein Fenster gleichzeitig (Standard: true). Erneutes Öffnen fokussiert es. */
  singleInstance?: boolean;
  /**
   * Bei mehreren Fenstern: ein Fenster pro Schlüssel (z. B. ein Profilfenster pro User).
   * Öffnen mit gleichem Schlüssel holt das vorhandene Fenster nach vorne.
   */
  instanceKey?: (params?: Record<string, unknown>) => string;
  placement?: AppPlacement;
}

/** Hilfsfunktion für Typ-Inferenz beim Definieren einer App. */
export const defineApp = (app: AppDefinition): AppDefinition => app;
