import { useMapStore } from "./useMapStore";

// ── State selectors ──────────────────────────────────────────────────────────

export const useDevices = () => useMapStore((s) => s.devices);
export const useWalls = () => useMapStore((s) => s.walls);
export const useCurrentFloorId = () => useMapStore((s) => s.currentFloorId);
export const useSelectedDeviceId = () => useMapStore((s) => s.selectedDeviceId);
export const useIsEditMode = () => useMapStore((s) => s.isEditMode);
export const useActiveDrawTool = () => useMapStore((s) => s.activeDrawTool);
export const useSelectedWallColor = () =>
  useMapStore((s) => s.selectedWallColor);
export const useHighlightedDeviceIds = () =>
  useMapStore((s) => s.highlightedDeviceIds);

// ── Derived selectors ────────────────────────────────────────────────────────

export const useIsDeviceSelected = (id: string) =>
  useMapStore((s) => s.selectedDeviceId === id);
export const useIsDeviceHighlighted = (id: string) =>
  useMapStore((s) => s.highlightedDeviceIds.includes(id));
