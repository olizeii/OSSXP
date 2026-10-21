/**
 * Chat-Zustand für chatterinoXP auf der gemeinsamen Socket-Verbindung (core/socket.ts).
 * Beim Öffnen des Fensters werden Channels betreten, beim Schließen verlassen –
 * die Verbindung selbst bleibt für Live-Updates (Coins, Abzeichen) bestehen.
 */
import { create } from 'zustand';
import { getSocket } from '../../core/socket';

export interface ChatUser {
  id: number | null;
  username: string;
  color: string;
  /** Bis zu 2 Abzeichen-IDs, die dezent vor dem Namen erscheinen */
  badges?: string[];
}

export interface ChatMessage {
  id: number | string;
  channel: string;
  user: ChatUser | null; // null = Systemnachricht
  text: string;
  createdAt: number;
}

interface Hello {
  channels: string[];
  user: ChatUser | null;
  readOnly: boolean;
}

interface ChatState {
  connected: boolean;
  readOnly: boolean;
  me: ChatUser | null;
  /** Alle Channels, die der Server anbietet (erster = allgemein). */
  channels: string[];
  /** Geöffnete Tabs. */
  tabs: string[];
  active: string | null;
  messages: Record<string, ChatMessage[]>;
  viewers: Record<string, number>;
  unread: Record<string, boolean>;

  connect: () => void;
  disconnect: () => void;
  openTab: (channel: string) => void;
  closeTab: (channel: string) => void;
  setActive: (channel: string) => void;
  send: (text: string) => Promise<string | null>;
}

const MAX_MESSAGES = 500;
let systemId = 0;
let unbind: (() => void) | null = null;

const system = (channel: string, text: string): ChatMessage => ({
  id: `sys-${++systemId}`,
  channel,
  user: null,
  text,
  createdAt: Date.now(),
});

export const useChatStore = create<ChatState>()((set, get) => {
  const append = (channel: string, ...msgs: ChatMessage[]) =>
    set((s) => {
      const existing = s.messages[channel] ?? [];
      const ids = new Set(existing.map((m) => m.id));
      const next = [...existing, ...msgs.filter((m) => !ids.has(m.id))].slice(-MAX_MESSAGES);
      return {
        messages: { ...s.messages, [channel]: next },
        unread: s.active === channel ? s.unread : { ...s.unread, [channel]: true },
      };
    });

  const join = (channel: string) => {
    getSocket().emit('chat:join', channel, (res: { history?: ChatMessage[]; error?: string }) => {
      if (res.error) return append(channel, system(channel, res.error));
      append(channel, system(channel, `Verbunden mit #${channel}`), ...(res.history ?? []));
    });
  };

  /** Begrüßung des Servers verarbeiten: Rechte übernehmen und Tabs (neu) betreten. */
  const onHello = (hello: Hello) => {
    const general = hello.channels[0];
    const tabs = get().tabs.length ? get().tabs.filter((t) => hello.channels.includes(t)) : [general];
    set({
      connected: true,
      channels: hello.channels,
      readOnly: hello.readOnly,
      me: hello.user,
      tabs,
      // Beim Start immer zuerst der allgemeine Chatroom
      active: get().active && tabs.includes(get().active!) ? get().active : general,
    });
    tabs.forEach(join);
  };

  return {
    connected: false,
    readOnly: true,
    me: null,
    channels: [],
    tabs: [],
    active: null,
    messages: {},
    viewers: {},
    unread: {},

    connect() {
      if (unbind) return;
      const socket = getSocket();
      const init = () => socket.emit('chat:init', onHello);
      const onMessage = (msg: ChatMessage) => append(msg.channel, msg);
      const onViewers = ({ channel, count }: { channel: string; count: number }) =>
        set((s) => ({ viewers: { ...s.viewers, [channel]: count } }));
      const onDisconnect = (reason: string) => {
        set({ connected: false });
        // Gewollte Trennung (Neuverbindung nach Login/Logout) nicht als Fehler melden
        if (reason === 'io client disconnect') return;
        get().tabs.forEach((t) => append(t, system(t, 'Verbindung getrennt – versuche erneut…')));
      };

      socket.on('connect', init);
      socket.on('chat:message', onMessage);
      socket.on('chat:viewers', onViewers);
      socket.on('disconnect', onDisconnect);
      if (socket.connected) init();

      unbind = () => {
        socket.off('connect', init);
        socket.off('chat:message', onMessage);
        socket.off('chat:viewers', onViewers);
        socket.off('disconnect', onDisconnect);
      };
    },

    disconnect() {
      get().tabs.forEach((t) => getSocket().emit('chat:leave', t));
      unbind?.();
      unbind = null;
      set({ connected: false, tabs: [], active: null, messages: {}, unread: {} });
    },

    openTab(channel) {
      const { tabs } = get();
      if (!tabs.includes(channel)) {
        set({ tabs: [...tabs, channel] });
        join(channel);
      }
      get().setActive(channel);
    },

    closeTab(channel) {
      const { tabs, active } = get();
      if (tabs.length <= 1) return;
      getSocket().emit('chat:leave', channel);
      const rest = tabs.filter((t) => t !== channel);
      set((s) => ({
        tabs: rest,
        active: active === channel ? rest[Math.max(0, tabs.indexOf(channel) - 1)] : active,
        messages: { ...s.messages, [channel]: [] },
      }));
    },

    setActive(channel) {
      set((s) => ({ active: channel, unread: { ...s.unread, [channel]: false } }));
    },

    send(text) {
      const { active } = get();
      return new Promise((resolve) => {
        const socket = getSocket();
        if (!socket.connected || !active) return resolve('Nicht verbunden.');
        socket.timeout(5000).emit('chat:send', { channel: active, text }, (err: Error | null, res: { error?: string }) => {
          const error = err ? 'Zeitüberschreitung beim Senden.' : (res?.error ?? null);
          if (error) append(active, system(active, error));
          resolve(error);
        });
      });
    },
  };
});
