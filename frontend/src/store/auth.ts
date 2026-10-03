import { create } from 'zustand';
import { api } from '../api/client';

export interface MeUser {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'member';
  family_id: string | null;
  family_name?: string | null;
  is_demo: boolean;
  impersonated_by?: string | null;
  timezone?: string;
  currency?: string;
}

interface AuthState {
  user: MeUser | null;
  loading: boolean;
  load: () => Promise<void>;
  logout: () => Promise<void>;
  clear: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  load: async () => {
    try {
      const u = await api.get<MeUser>('/auth/me');
      set({ user: u, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      set({ user: null });
    }
  },
  clear: () => set({ user: null }),
}));

export const useIsSuperadmin = () => {
  // супер-админ определяется отдельным токеном; проверям через /superadmin/me lazily в панели
  return null;
};
