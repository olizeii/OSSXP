/**
 * Globaler Economy-Zustand: Coins, Level/XP, Abzeichen, Inventar, Profil-Ausrüstung + Kataloge.
 *
 * Datenfluss (App-übergreifend synchron):
 *   1. Nach dem Login lädt `load()` alles einmal von /api/economy/me.
 *   2. Jede Belohnung/Ausgabe auf dem Server schickt `economy:update` über den gemeinsamen Socket
 *      an ALLE offenen Tabs des Users → `applyUpdate()` setzt den neuen Stand.
 *   3. Komponenten (Taskleiste, Profil, Shop, Apps) lesen nur aus diesem Store.
 * Apps müssen Coins also nie selbst verwalten – sie lösen nur Aktionen beim Server aus.
 */
import { create } from 'zustand';
import { api } from '../core/api';
import { getSocket } from '../core/socket';
import { useAuthStore } from './authStore';
import { useUiStore } from './uiStore';

export interface Wallet {
  coins: number;
  level: number;
  xp: number;
  levelXp: number;
  levelSpan: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
}

export interface ShopItem {
  id: string;
  type: 'background' | 'frame';
  name: string;
  price: number;
  style?: Record<string, string>;
  asset?: string;
}

export interface ProfileSettings {
  bio: string;
  showcase: string[];
  background: string;
  frame: string;
}

interface Catalog {
  badges: BadgeDef[];
  items: ShopItem[];
}

interface EconomyUpdate {
  wallet: Wallet;
  coins?: number;
  xp?: number;
  levelUp?: number | null;
  badges?: string[];
  label?: string;
}

interface EconomyState {
  catalog: Catalog | null;
  wallet: Wallet | null;
  badges: { id: string; earnedAt: number }[];
  inventory: string[];
  profile: ProfileSettings | null;

  loadCatalog: () => Promise<void>;
  load: () => Promise<void>;
  reset: () => void;
  applyUpdate: (u: EconomyUpdate) => void;
  buy: (itemId: string) => Promise<void>;
  setProfile: (p: ProfileSettings) => void;
}

export const useEconomyStore = create<EconomyState>()((set, get) => ({
  catalog: null,
  wallet: null,
  badges: [],
  inventory: [],
  profile: null,

  async loadCatalog() {
    if (get().catalog) return;
    set({ catalog: await api<Catalog>('/economy/catalog') });
  },

  async load() {
    const me = await api<{ wallet: Wallet; badges: EconomyState['badges']; inventory: string[]; profile: ProfileSettings }>('/economy/me');
    set({ wallet: me.wallet, badges: me.badges, inventory: me.inventory, profile: me.profile });
  },

  reset: () => set({ wallet: null, badges: [], inventory: [], profile: null }),

  applyUpdate(u) {
    const known = new Set(get().badges.map((b) => b.id));
    const newBadges = (u.badges ?? []).filter((id) => !known.has(id));
    set((s) => ({ wallet: u.wallet, badges: [...s.badges, ...newBadges.map((id) => ({ id, earnedAt: Date.now() }))] }));

    // XP-Sprechblase am Infobereich – wie „Neue Hardware gefunden“
    const notify = useUiStore.getState().notify;
    const catalog = get().catalog;
    if (u.levelUp) notify({ title: `Level ${u.levelUp} erreicht!`, text: 'Glückwunsch – dafür gibt es Bonus-Coins.', icon: 'level' });
    for (const id of newBadges) {
      const def = catalog?.badges.find((b) => b.id === id);
      notify({ title: 'Neues Abzeichen!', text: def ? `„${def.name}“ – ${def.description}` : id, icon: 'badge' });
    }
    if (!u.levelUp && !newBadges.length && (u.coins ?? 0) > 0) {
      notify({ title: `+${u.coins} Coins`, text: `${u.label ?? 'Belohnung'}${u.xp ? ` · +${u.xp} XP` : ''}`, icon: 'coins' });
    }
  },

  async buy(itemId) {
    const res = await api<{ wallet: Wallet; inventory: string[] }>('/economy/shop/buy', { method: 'POST', body: { itemId } });
    set({ wallet: res.wallet, inventory: res.inventory });
  },

  setProfile: (profile) => set({ profile }),
}));

/** Einmalig in App.tsx: Socket-Events abonnieren und bei Login/Logout laden bzw. leeren. */
export function initEconomy() {
  const store = useEconomyStore.getState();
  store.loadCatalog().catch(() => {});
  getSocket().on('economy:update', (u: EconomyUpdate) => useEconomyStore.getState().applyUpdate(u));

  const sync = (loggedIn: boolean) => (loggedIn ? useEconomyStore.getState().load().catch(() => {}) : useEconomyStore.getState().reset());
  sync(Boolean(useAuthStore.getState().user));
  return useAuthStore.subscribe((s, prev) => {
    if (s.user?.id !== prev.user?.id) sync(Boolean(s.user));
  });
}
