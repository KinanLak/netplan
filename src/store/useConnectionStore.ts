import { create } from "zustand";

/**
 * What the connection banner decided, for the components that follow it:
 * the map is frozen the moment the connection drops (ADR 0034), and the
 * toaster rises while the offline line shows.
 */
export const useConnectionStore = create<{
  isMapFrozen: boolean;
  isBannerShown: boolean;
}>()(() => ({ isMapFrozen: false, isBannerShown: false }));
