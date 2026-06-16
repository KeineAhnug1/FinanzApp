'use client';

import { create } from 'zustand';

type ModalId = string | null;

interface UiState {
  openModal: ModalId;
  sideNavCollapsed: boolean;
  sideNavMobileOpen: boolean;
  openModal_: (id: string) => void;
  closeModal: () => void;
  toggleSideNavCollapsed: () => void;
  setSideNavMobileOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  openModal: null,
  sideNavCollapsed: false,
  sideNavMobileOpen: false,
  openModal_: (id) => set({ openModal: id }),
  closeModal: () => set({ openModal: null }),
  toggleSideNavCollapsed: () => set((s) => ({ sideNavCollapsed: !s.sideNavCollapsed })),
  setSideNavMobileOpen: (open) => set({ sideNavMobileOpen: open }),
}));
