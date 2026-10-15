import { useCanEdit } from "@/hooks/use-current-user";
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
// The store flag is the user's choice; a reader's map stays read-only whatever
// it says.
export const useIsEditMode = () => {
  const isEditMode = useMapStore((s) => s.isEditMode);
  const canEdit = useCanEdit();
  return isEditMode && canEdit;
};
export const useIsMultiSelectMode = () =>
  useMapStore((s) => s.isMultiSelectMode);
export const useActiveDrawTool = () => useMapStore((s) => s.activeDrawTool);
export const useSelectedWallColor = () =>
  useMapStore((s) => s.selectedWallColor);
export const useWallEraserSize = () => useMapStore((s) => s.wallEraserSize);
export const useIsOverlayPanelOpen = () =>
  useMapStore((s) => s.isOverlayPanelOpen);
export const useIsOverlayHidden = () => useMapStore((s) => s.isOverlayHidden);
export const useHighlightedDeviceIds = () =>
  useMapStore((s) => s.highlightedDeviceIds);

// ── Derived selectors ────────────────────────────────────────────────────────

export const useIsDeviceSelected = (id: DeviceId) =>
  useMapStore(
    (s) => s.selectedDeviceId === id || s.selectedDeviceIdSet.has(id),
  );
export const useIsDeviceHighlighted = (id: DeviceId) =>
  useMapStore((s) => s.highlightedDeviceIdSet.has(id));
