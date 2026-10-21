/**
 * Chat-Zustand + Socket.IO-Verbindung für chatterinoXP.
 * Die Verbindung lebt, solange das Chat-Fenster offen ist (auch minimiert).
 */
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

export interface ChatUser {
  id: number | null;
  username: string;
  color: string;
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
  /** Neu verbinden, z. B. nach Login/Logout (neues Cookie im Handshake). */
  reconnect: () => void;
  openTab: (channel: string) => void;
  closeTab: (channel: string) => void;
  setActive: (channel: string) => void;
  send: (text: string) => Promise<string | null>;
}

const MAX_MESSAGES = 500;
let socket: Socket | null = null;
let systemId = 0;

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
    socket?.emit('chat:join', channel, (res: { history?: ChatMessage[]; error?: string }) => {
      if (res.error) return append(channel, system(channel, res.error));
      append(channel, system(channel, `Verbunden mit #${channel}`), ...(res.history ?? []));
    });
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
      if (socket) return;
      socket = io({ withCredentials: true });

      socket.on('connect', () => set({ connected: true }));

      socket.on('chat:hello', (hello: Hello) => {
        const general = hello.channels[0];
        const tabs = get().tabs.length ? get().tabs.filter((t) => hello.channels.includes(t)) : [general];
        set({
          channels: hello.channels,
          readOnly: hello.readOnly,
          me: hello.user,
          tabs,
          // Beim Start immer zuerst der allgemeine Chatroom
          active: get().active && tabs.includes(get().active!) ? get().active : general,
        });
        tabs.forEach(join);
      });

      socket.on('chat:message', (msg: ChatMessage) => append(msg.channel, msg));

      socket.on('chat:viewers', ({ channel, count }: { channel: string; count: number }) =>
        set((s) => ({ viewers: { ...s.viewers, [channel]: count } })),
      );

      socket.on('disconnect', (reason) => {
        set({ connected: false });
        // Gewollte Trennung (reconnect nach Login/Logout) nicht als Fehler melden
        if (reason === 'io client disconnect') return;
        get().tabs.forEach((t) => append(t, system(t, 'Verbindung getrennt – versuche erneut…')));
      });
    },

    disconnect() {
      socket?.disconnect();
      socket = null;
      set({ connected: false, tabs: [], active: null, messages: {}, unread: {} });
    },

    reconnect() {
      if (!socket) return;
      socket.disconnect();
      socket.connect();
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
      socket?.emit('chat:leave', channel);
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
        if (!socket || !active) return resolve('Nicht verbunden.');
        socket.timeout(5000).emit('chat:send', { channel: active, text }, (err: Error | null, res: { error?: string }) => {
          const error = err ? 'Zeitüberschreitung beim Senden.' : (res?.error ?? null);
          if (error) append(active, system(active, error));
          resolve(error);
        });
      });
    },
  };
});
