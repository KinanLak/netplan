import type { DeviceId } from "@/types/map";
import { useMapStore } from "./useMapStore";

// ── State selectors ──────────────────────────────────────────────────────────

export const useCurrentBuildingId = () =>
  useMapStore((s) => s.currentBuildingId);
export const useCurrentFloorId = () => useMapStore((s) => s.currentFloorId);
export const useSelectedDeviceId = () => useMapStore((s) => s.selectedDeviceId);
export const useSelectedDeviceIds = () =>
  useMapStore((s) => s.selectedDeviceIds);
export const useHoveredDeviceId = () => useMapStore((s) => s.hoveredDeviceId);
export const useIsEditMode = () => useMapStore((s) => s.isEditMode);
export const useIsMultiSelectMode = () =>
  useMapStore((s) => s.isMultiSelectMode);
export const useActiveDrawTool = () => useMapStore((s) => s.activeDrawTool);
export const useSelectedWallColor = () =>
  useMapStore((s) => s.selectedWallColor);
export const useWallEraserSize = () => useMapStore((s) => s.wallEraserSize);
export const useHighlightedDeviceIds = () =>
  useMapStore((s) => s.highlightedDeviceIds);

// ── Derived selectors ────────────────────────────────────────────────────────

export const useIsDeviceSelected = (id: DeviceId) =>
  useMapStore(
    (s) => s.selectedDeviceId === id || s.selectedDeviceIdSet.has(id),
  );
export const useIsDeviceHighlighted = (id: DeviceId) =>
  useMapStore((s) => s.highlightedDeviceIdSet.has(id));
