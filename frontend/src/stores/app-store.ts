'use client';

import { create } from 'zustand';
import type { User, BankAccount } from '@/types';

interface AppState {
  user: User | null;
  bankAccounts: BankAccount[];
  setUser: (user: User | null) => void;
  setBankAccounts: (accounts: BankAccount[]) => void;
  updateUser: (patch: Partial<User>) => void;
  clearSession: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  bankAccounts: [],
  setUser: (user) => set({ user }),
  setBankAccounts: (bankAccounts) => set({ bankAccounts }),
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
  clearSession: () => set({ user: null, bankAccounts: [] }),
}));
