import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  isRailCollapsed: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  openSidebar: () => void;
  toggleRail: () => void;
}

/**
 * useUIStore
 * Manages global UI state like sidebar visibility and modal states.
 * `isSidebarOpen` is the mobile drawer; `isRailCollapsed` is the 64 px desktop rail.
 */
export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: false, // Default closed on mobile
  isRailCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  closeSidebar: () => set({ isSidebarOpen: false }),
  openSidebar: () => set({ isSidebarOpen: true }),
  toggleRail: () => set((state) => ({ isRailCollapsed: !state.isRailCollapsed })),
}));
