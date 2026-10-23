/**
 * Window-Manager-Zustand (Zustand).
 *
 * Verwaltet alle offenen Fenster: Position, Größe, Z-Reihenfolge, minimiert/maximiert.
 * Die zuletzt benutzte Größe/Position pro App wird im localStorage gemerkt (persist-Middleware),
 * damit Fenster beim nächsten Öffnen wieder an derselben Stelle erscheinen.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppDefinition } from '../core/types';

/** Höhe der Taskleiste in px – Fenster dürfen nicht dahinter verschwinden. */
export const TASKBAR_HEIGHT = 30;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState extends Bounds {
  id: string;
  appId: string;
  title: string;
  icon: string;
  z: number;
  minimized: boolean;
  maximized: boolean;
  resizable: boolean;
  minWidth: number;
  minHeight: number;
  params?: Record<string, unknown>;
}

interface WindowStore {
  windows: WindowState[];
  activeId: string | null;
  zCounter: number;
  /** Gemerkte Bounds pro appId (persistiert). */
  remembered: Record<string, Bounds>;

  open: (app: AppDefinition, params?: Record<string, unknown>) => string;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  /** Klick auf den Taskleisten-Button: minimieren, wenn aktiv – sonst nach vorne holen. */
  toggleFromTaskbar: (id: string) => void;
  setBounds: (id: string, bounds: Partial<Bounds>) => void;
  setTitle: (id: string, title: string) => void;
  closeWhere: (predicate: (w: WindowState) => boolean) => void;
}

let nextId = 1;

/** Oberstes, nicht minimiertes Fenster (für den Fokus nach Minimieren/Schließen). */
function topWindow(windows: WindowState[], exceptId?: string) {
  return windows
    .filter((w) => !w.minimized && w.id !== exceptId)
    .sort((a, b) => b.z - a.z)[0];
}

/** Startposition: gemerkte Bounds oder zentriert + kaskadiert wie unter XP. */
function initialBounds(app: AppDefinition, rememberedBounds: Bounds | undefined, openCount: number): Bounds {
  // Hintergrund-Tabs melden mitunter 0 × 0 – dann mit einer üblichen Größe rechnen
  const vw = window.innerWidth || 1024;
  const vh = (window.innerHeight || 768) - TASKBAR_HEIGHT;
  const minW = Math.min(app.window?.minWidth ?? 200, vw);
  const minH = Math.min(app.window?.minHeight ?? 120, vh);
  // Kaputte gemerkte Größen (z. B. 0 px breit) ignorieren
  const remembered = rememberedBounds && rememberedBounds.width >= minW && rememberedBounds.height >= minH ? rememberedBounds : undefined;
  const width = Math.max(minW, Math.min(remembered?.width ?? app.window?.width ?? 640, vw));
  const height = Math.max(minH, Math.min(remembered?.height ?? app.window?.height ?? 440, vh));

  if (remembered) {
    return {
      width,
      height,
      x: Math.min(Math.max(remembered.x, 0), Math.max(vw - width, 0)),
      y: Math.min(Math.max(remembered.y, 0), Math.max(vh - height, 0)),
    };
  }
  const cascade = (openCount % 8) * 26;
  return {
    width,
    height,
    x: Math.max(0, Math.round((vw - width) / 2) - 80 + cascade),
    y: Math.max(0, Math.round((vh - height) / 2) - 60 + cascade),
  };
}

export const useWindowStore = create<WindowStore>()(
  persist(
    (set, get) => ({
      windows: [],
      activeId: null,
      zCounter: 10,
      remembered: {},

      open(app, params) {
        const { windows, remembered, zCounter } = get();

        // Single-Instance-Apps (oder gleicher instanceKey): vorhandenes Fenster fokussieren und Parameter aktualisieren
        if (app.singleInstance !== false || app.instanceKey) {
          const key = app.instanceKey?.(params);
          const existing = windows.find((w) => w.appId === app.id && (!app.instanceKey || app.instanceKey(w.params) === key));
          if (existing) {
            set({
              windows: windows.map((w) =>
                w.id === existing.id ? { ...w, params: params ?? w.params, minimized: false, z: zCounter + 1 } : w,
              ),
              activeId: existing.id,
              zCounter: zCounter + 1,
            });
            return existing.id;
          }
        }

        const id = `win-${nextId++}`;
        const win: WindowState = {
          id,
          appId: app.id,
          title: app.title,
          icon: app.icon,
          ...initialBounds(app, remembered[app.id], windows.length),
          z: zCounter + 1,
          minimized: false,
          maximized: Boolean(app.window?.maximized),
          resizable: app.window?.resizable !== false,
          minWidth: app.window?.minWidth ?? 260,
          minHeight: app.window?.minHeight ?? 160,
          params,
        };
        set({ windows: [...windows, win], activeId: id, zCounter: zCounter + 1 });
        return id;
      },

      close(id) {
        const { windows, activeId, remembered } = get();
        const win = windows.find((w) => w.id === id);
        if (!win) return;
        const rest = windows.filter((w) => w.id !== id);
        set({
          windows: rest,
          activeId: activeId === id ? (topWindow(rest)?.id ?? null) : activeId,
          remembered: win.maximized
            ? remembered
            : { ...remembered, [win.appId]: { x: win.x, y: win.y, width: win.width, height: win.height } },
        });
      },

      focus(id) {
        const { windows, activeId, zCounter } = get();
        const win = windows.find((w) => w.id === id);
        if (!win || (activeId === id && !win.minimized && win.z === zCounter)) return;
        set({
          windows: windows.map((w) => (w.id === id ? { ...w, z: zCounter + 1, minimized: false } : w)),
          activeId: id,
          zCounter: zCounter + 1,
        });
      },

      minimize(id) {
        const { windows } = get();
        const next = windows.map((w) => (w.id === id ? { ...w, minimized: true } : w));
        set({ windows: next, activeId: topWindow(next, id)?.id ?? null });
      },

      toggleMaximize(id) {
        set((s) => ({
          windows: s.windows.map((w) => (w.id === id && w.resizable ? { ...w, maximized: !w.maximized } : w)),
        }));
        get().focus(id);
      },

      toggleFromTaskbar(id) {
        const { windows, activeId } = get();
        const win = windows.find((w) => w.id === id);
        if (!win) return;
        if (activeId === id && !win.minimized) get().minimize(id);
        else get().focus(id);
      },

      setBounds(id, bounds) {
        set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...bounds } : w)) }));
      },

      setTitle(id, title) {
        set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, title } : w)) }));
      },

      closeWhere(predicate) {
        get().windows.filter(predicate).forEach((w) => get().close(w.id));
      },
    }),
    {
      name: 'ossxp-windows',
      partialize: (s) => ({ remembered: s.remembered }),
    },
  ),
);
