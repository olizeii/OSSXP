/**
 * Chat-Zustand für chatterinoXP auf der gemeinsamen Socket-Verbindung (core/socket.ts).
 * Tabs sind öffentliche Channels („allgemein“) oder Privatnachrichten („@name“).
 * Beim Öffnen des Fensters werden Channels betreten, beim Schließen verlassen –
 * die Verbindung selbst bleibt für Live-Updates (Coins, Abzeichen, Privatnachrichten) bestehen.
 */
import { create } from 'zustand';
import { getSocket } from '../../core/socket';
import type { Rank } from '../../store/authStore';

export interface ChatUser {
  id: number | null;
  username: string;
  color: string;
  rank?: Rank;
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
  canCreateChannels: boolean;
  canModerate: boolean;
}

interface DmMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  createdAt: number;
  partner?: { username: string; color: string };
}

export interface Conversation {
  partner: { username: string; color: string };
  last: { text: string; createdAt: number; fromMe: boolean };
  unread: number;
}

interface ChatState {
  connected: boolean;
  readOnly: boolean;
  me: ChatUser | null;
  canCreateChannels: boolean;
  canModerate: boolean;
  /** Alle öffentlichen Channels (erster = allgemein). */
  channels: string[];
  /** Geöffnete Tabs: Channel-Namen oder „@name“ für Privatnachrichten */
  tabs: string[];
  active: string | null;
  messages: Record<string, ChatMessage[]>;
  viewers: Record<string, number>;
  unread: Record<string, boolean>;
  dmColors: Record<string, string>;

  connect: () => void;
  disconnect: () => void;
  openTab: (tab: string) => void;
  closeTab: (tab: string) => void;
  setActive: (tab: string) => void;
  send: (text: string) => Promise<string | null>;
  createChannel: (name: string) => Promise<string | null>;
  deleteChannel: (name: string) => Promise<string | null>;
  listConversations: () => Promise<Conversation[]>;
}

const MAX_MESSAGES = 500;
let systemId = 0;
let unbind: (() => void) | null = null;

export const isDm = (tab: string) => tab.startsWith('@');

const system = (channel: string, text: string): ChatMessage => ({
  id: `sys-${++systemId}`,
  channel,
  user: null,
  text,
  createdAt: Date.now(),
});

export const useChatStore = create<ChatState>()((set, get) => {
  const append = (tab: string, ...msgs: ChatMessage[]) =>
    set((s) => {
      const existing = s.messages[tab] ?? [];
      const ids = new Set(existing.map((m) => m.id));
      const next = [...existing, ...msgs.filter((m) => !ids.has(m.id))].slice(-MAX_MESSAGES);
      return {
        messages: { ...s.messages, [tab]: next },
        unread: s.active === tab ? s.unread : { ...s.unread, [tab]: true },
      };
    });

  const dmToMessage = (m: DmMessage, partner: string): ChatMessage => ({
    id: m.id,
    channel: `@${partner}`,
    user: { id: null, username: m.from, color: m.from === partner ? (get().dmColors[partner] ?? '#9ac') : (get().me?.color ?? '#fff') },
    text: m.text,
    createdAt: m.createdAt,
  });

  const join = (tab: string) => {
    if (isDm(tab)) {
      const partner = tab.slice(1);
      getSocket().emit('dm:history', { username: partner }, (res: { error?: string; partner?: { color: string }; messages?: DmMessage[] }) => {
        if (res.error) return append(tab, system(tab, res.error));
        set((s) => ({ dmColors: { ...s.dmColors, [partner]: res.partner?.color ?? '#9ac' } }));
        append(tab, system(tab, `Privatnachrichten mit ${partner} – nur ihr beide könnt sie sehen.`), ...(res.messages ?? []).map((m) => dmToMessage(m, partner)));
      });
      return;
    }
    getSocket().emit('chat:join', tab, (res: { history?: ChatMessage[]; error?: string }) => {
      if (res.error) return append(tab, system(tab, res.error));
      append(tab, system(tab, `Verbunden mit #${tab}`), ...(res.history ?? []));
    });
  };

  /** Begrüßung des Servers verarbeiten: Rechte übernehmen und Tabs (neu) betreten. */
  const onHello = (hello: Hello) => {
    const general = hello.channels[0];
    const keep = (t: string) => isDm(t) ? Boolean(hello.user) : hello.channels.includes(t);
    const tabs = get().tabs.length ? get().tabs.filter(keep) : [general];
    set({
      connected: true,
      channels: hello.channels,
      readOnly: hello.readOnly,
      me: hello.user,
      canCreateChannels: hello.canCreateChannels,
      canModerate: hello.canModerate,
      tabs: tabs.length ? tabs : [general],
      // Beim Start immer zuerst der allgemeine Chatroom
      active: get().active && tabs.includes(get().active!) ? get().active : general,
    });
    (tabs.length ? tabs : [general]).forEach(join);
  };

  const ack = <T,>(event: string, payload: unknown) =>
    new Promise<T>((resolve) => getSocket().timeout(5000).emit(event, payload, (err: Error | null, res: T) => resolve(err ? ({ error: 'Zeitüberschreitung.' } as T) : res)));

  return {
    connected: false,
    readOnly: true,
    me: null,
    canCreateChannels: false,
    canModerate: false,
    channels: [],
    tabs: [],
    active: null,
    messages: {},
    viewers: {},
    unread: {},
    dmColors: {},

    connect() {
      if (unbind) return;
      const socket = getSocket();
      const init = () => socket.emit('chat:init', onHello);
      const onMessage = (msg: ChatMessage) => append(msg.channel, msg);
      const onNotice = ({ channel, text }: { channel: string; text: string }) => append(channel, system(channel, text));
      const onViewers = ({ channel, count }: { channel: string; count: number }) => set((s) => ({ viewers: { ...s.viewers, [channel]: count } }));
      const onChannels = (channels: string[]) =>
        set((s) => {
          const tabs = s.tabs.filter((t) => isDm(t) || channels.includes(t));
          return { channels, tabs, active: s.active && tabs.includes(s.active) ? s.active : tabs[0] ?? null };
        });
      const onDm = (m: DmMessage) => {
        const me = get().me?.username;
        const partner = m.from === me ? m.to : m.from;
        const tab = `@${partner}`;
        if (m.partner) set((s) => ({ dmColors: { ...s.dmColors, [partner]: m.partner!.color } }));
        if (!get().tabs.includes(tab)) set((s) => ({ tabs: [...s.tabs, tab] }));
        append(tab, dmToMessage(m, partner));
      };
      const onDisconnect = (reason: string) => {
        set({ connected: false });
        // Gewollte Trennung (Neuverbindung nach Login/Logout) nicht als Fehler melden
        if (reason === 'io client disconnect') return;
        get().tabs.forEach((t) => append(t, system(t, 'Verbindung getrennt – versuche erneut…')));
      };

      socket.on('connect', init);
      socket.on('chat:message', onMessage);
      socket.on('chat:notice', onNotice);
      socket.on('chat:viewers', onViewers);
      socket.on('chat:channels', onChannels);
      socket.on('dm:message', onDm);
      socket.on('disconnect', onDisconnect);
      if (socket.connected) init();

      unbind = () => {
        socket.off('connect', init);
        socket.off('chat:message', onMessage);
        socket.off('chat:notice', onNotice);
        socket.off('chat:viewers', onViewers);
        socket.off('chat:channels', onChannels);
        socket.off('dm:message', onDm);
        socket.off('disconnect', onDisconnect);
      };
    },

    disconnect() {
      get().tabs.filter((t) => !isDm(t)).forEach((t) => getSocket().emit('chat:leave', t));
      unbind?.();
      unbind = null;
      set({ connected: false, tabs: [], active: null, messages: {}, unread: {} });
    },

    openTab(tab) {
      const { tabs } = get();
      if (!tabs.includes(tab)) {
        set({ tabs: [...tabs, tab] });
        join(tab);
      } else if (isDm(tab) && !get().messages[tab]?.length) {
        join(tab);
      }
      get().setActive(tab);
    },

    closeTab(tab) {
      const { tabs, active } = get();
      if (tabs.length <= 1) return;
      if (!isDm(tab)) getSocket().emit('chat:leave', tab);
      const rest = tabs.filter((t) => t !== tab);
      set((s) => ({
        tabs: rest,
        active: active === tab ? rest[Math.max(0, tabs.indexOf(tab) - 1)] : active,
        messages: { ...s.messages, [tab]: [] },
      }));
    },

    setActive(tab) {
      set((s) => ({ active: tab, unread: { ...s.unread, [tab]: false } }));
    },

    async send(text) {
      const { active } = get();
      if (!getSocket().connected || !active) return 'Nicht verbunden.';
      const res = isDm(active)
        ? await ack<{ error?: string; info?: string }>('dm:send', { to: active.slice(1), text })
        : await ack<{ error?: string; info?: string }>('chat:send', { channel: active, text });
      if (res?.info) append(active, system(active, res.info));
      if (res?.error) append(active, system(active, res.error));
      return res?.error ?? null;
    },

    async createChannel(name) {
      const res = await ack<{ error?: string; channel?: string }>('chat:createChannel', { name });
      if (res.channel) get().openTab(res.channel);
      return res.error ?? null;
    },

    async deleteChannel(name) {
      const res = await ack<{ error?: string }>('chat:deleteChannel', { name });
      return res.error ?? null;
    },

    listConversations: () =>
      new Promise((resolve) => getSocket().emit('dm:list', (res: { conversations: Conversation[] }) => resolve(res?.conversations ?? []))),
  };
});
