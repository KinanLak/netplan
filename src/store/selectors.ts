import { useCanEdit } from "@/hooks/use-current-user";
import type { DeviceId } from "@/types/map";
import { useConnectionStore } from "./useConnectionStore";
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
// it says, and so does a map frozen by a lost connection (ADR 0031), until
// it returns.
export const useIsEditMode = () => {
  const isEditMode = useMapStore((s) => s.isEditMode);
  const isMapFrozen = useConnectionStore((s) => s.isMapFrozen);
  const canEdit = useCanEdit();
  return isEditMode && canEdit && !isMapFrozen;
};
export const useIsMultiSelectMode = () =>
  useMapStore((s) => s.isMultiSelectMode);
export const useActiveDrawTool = () => useMapStore((s) => s.activeDrawTool);
export const useSelectedWallColor = () =>
  useMapStore((s) => s.selectedWallColor);
export const useWallEraserSize = () => useMapStore((s) => s.wallEraserSize);
export const useIsOverlayPanelOpen = () =>
  useMapStore((s) => s.isOverlayPanelOpen);
export const useIsPlacePanelOpen = () => useMapStore((s) => s.isPlacePanelOpen);
export const useIsOverlayHidden = () => useMapStore((s) => s.isOverlayHidden);
export const useShownCablesDeviceId = () =>
  useMapStore((s) => s.shownCablesDeviceId);

// ── Derived selectors ────────────────────────────────────────────────────────

export const useIsDeviceSelected = (id: DeviceId) =>
  useMapStore(
    (s) => s.selectedDeviceId === id || s.selectedDeviceIdSet.has(id),
  );
export const useShowsCables = (id: DeviceId) =>
  useMapStore((s) => s.shownCablesDeviceId === id);
export const useIsLabelToolActive = () =>
  useMapStore((s) => s.isLabelToolActive);
