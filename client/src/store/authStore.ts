/**
 * Globaler Auth-Zustand (Zustand).
 * Der eigentliche Login steckt im httpOnly-Cookie – hier liegt nur das öffentliche User-Profil.
 */
import { create } from 'zustand';
import { api } from '../core/api';

export interface UntisLinkInfo {
  server: string;
  school: string;
  username: string;
}

export interface User {
  id: number;
  username: string;
  color: string;
  /** Admin laut ADMIN_USERNAMES (z. B. für NewsXP) */
  isAdmin: boolean;
  /** null = Standardbild, sonst "preset:<id>" oder data:-URL – siehe core/avatars.ts */
  avatar: string | null;
  createdAt: number;
  untisLinked: boolean;
  untis: UntisLinkInfo | null;
}

interface AuthState {
  user: User | null;
  /** 'loading' bis der erste /me-Request beantwortet ist. */
  status: 'loading' | 'ready';

  fetchMe: () => Promise<void>;
  login: (username: string, password: string) => Promise<User>;
  register: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Nach Profil-/Untis-Änderungen den neuen Stand vom Server übernehmen. */
  setUser: (user: User | null) => void;
}

type UserResponse = { user: User | null };

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'loading',

  async fetchMe() {
    try {
      const { user } = await api<UserResponse>('/auth/me');
      set({ user, status: 'ready' });
    } catch {
      set({ user: null, status: 'ready' });
    }
  },

  async login(username, password) {
    const { user } = await api<{ user: User }>('/auth/login', { method: 'POST', body: { username, password } });
    set({ user });
    return user;
  },

  async register(username, password) {
    const { user } = await api<{ user: User }>('/auth/register', { method: 'POST', body: { username, password } });
    set({ user });
    return user;
  },

  async logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    set({ user: null });
  },

  setUser: (user) => set({ user }),
}));
