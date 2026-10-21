/**
 * UI-Zustand der Shell: Startmenü, Login-Dialog, Meldungsfenster, Herunterfahren/Power-Zustände.
 */
import { create } from 'zustand';

export type MessageIcon = 'info' | 'warning' | 'error' | 'question';

export interface MessageButton {
  label: string;
  action?: () => void;
  /** Standard-Button (Enter, fokussiert). */
  primary?: boolean;
}

export interface MessageBox {
  id: number;
  title: string;
  text: string;
  icon: MessageIcon;
  buttons: MessageButton[];
}

/**
 * Power-Zustände:
 *  on           → normaler Desktop
 *  shutdownMenu → „Computer ausschalten“-Dialog (grauer Hintergrund)
 *  standby      → schwarzer Bildschirm, Klick weckt auf
 *  shuttingDown → „Seite wird geschlossen…“-Screen
 *  off          → „Sie können die Seite jetzt schließen.“
 */
export type PowerState = 'on' | 'shutdownMenu' | 'standby' | 'shuttingDown' | 'off';

/** Sprechblase am Infobereich der Taskleiste (wie XP-Benachrichtigungen). */
export interface Balloon {
  id: number;
  title: string;
  text: string;
  icon: 'coins' | 'level' | 'badge' | 'info';
}

interface UiStore {
  startMenuOpen: boolean;
  toggleStartMenu: () => void;
  closeStartMenu: () => void;

  login: { open: boolean; mode: 'login' | 'register'; onSuccess?: () => void };
  openLogin: (opts?: { mode?: 'login' | 'register'; onSuccess?: () => void }) => void;
  closeLogin: () => void;

  messages: MessageBox[];
  showMessage: (msg: Omit<MessageBox, 'id' | 'buttons' | 'icon'> & Partial<Pick<MessageBox, 'buttons' | 'icon'>>) => void;
  dismissMessage: (id: number) => void;

  power: PowerState;
  setPower: (power: PowerState) => void;

  balloons: Balloon[];
  notify: (b: Omit<Balloon, 'id'>) => void;
  dismissBalloon: (id: number) => void;
}

let messageId = 1;
let balloonId = 1;

export const useUiStore = create<UiStore>()((set) => ({
  startMenuOpen: false,
  toggleStartMenu: () => set((s) => ({ startMenuOpen: !s.startMenuOpen })),
  closeStartMenu: () => set({ startMenuOpen: false }),

  login: { open: false, mode: 'login' },
  openLogin: (opts) =>
    set({ login: { open: true, mode: opts?.mode ?? 'login', onSuccess: opts?.onSuccess }, startMenuOpen: false }),
  closeLogin: () => set((s) => ({ login: { ...s.login, open: false, onSuccess: undefined } })),

  messages: [],
  showMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { icon: 'info', buttons: [{ label: 'OK', primary: true }], ...msg, id: messageId++ },
      ],
    })),
  dismissMessage: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),

  power: 'on',
  setPower: (power) => set({ power, startMenuOpen: false }),

  balloons: [],
  notify: (b) => {
    const id = balloonId++;
    // Höchstens 3 gleichzeitig; jede verschwindet nach 6 Sekunden
    set((s) => ({ balloons: [...s.balloons.slice(-2), { ...b, id }] }));
    setTimeout(() => useUiStore.getState().dismissBalloon(id), 6000);
  },
  dismissBalloon: (id) => set((s) => ({ balloons: s.balloons.filter((b) => b.id !== id) })),
}));
