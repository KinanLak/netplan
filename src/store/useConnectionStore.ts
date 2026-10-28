import { create } from "zustand";

/**
 * What the connection banner decided, for the components that follow it
 * (ADR 0037). `isOffline` turns true the moment the connection drops and
 * refuses every change; `isMapFrozen` follows once the drop has lasted, and
 * takes the edit controls away while the offline line shows. A socket that
 * reconnects at once therefore keeps open panels and what is typed in them.
 */
export const useConnectionStore = create<{
  isOffline: boolean;
  isMapFrozen: boolean;
}>()(() => ({ isOffline: false, isMapFrozen: false }));
