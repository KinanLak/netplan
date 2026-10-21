import { create } from "zustand";

/**
 * What the connection banner decided, for the components that follow it:
 * edit controls while the map is frozen, the toaster while the banner shows.
 */
export const useConnectionStore = create<{
  isMapFrozen: boolean;
  isBannerShown: boolean;
}>()(() => ({ isMapFrozen: false, isBannerShown: false }));
