import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  remember: boolean;
  setSession: (user: User, accessToken: string, refreshToken: string, remember: boolean) => void;
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      remember: false,
      setSession: (user, accessToken, refreshToken, remember) => {
        set({ user, accessToken, refreshToken, remember });
      },
      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      logout: () => set({ user: null, accessToken: null, refreshToken: null, remember: false })
    }),
    {
      name: 'eastern-auth',
      version: 3,
      migrate: () => ({ user: null, accessToken: null, refreshToken: null, remember: false }),
      partialize: () => ({})
    }
  )
);
