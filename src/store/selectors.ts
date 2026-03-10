import { useMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";

export const useMapDocument = () => useMapStore((state) => state.document);
export const useBuildings = () =>
  useMapStore((state) => state.document.buildings);
export const useDevices = () => useMapStore((state) => state.document.devices);
export const useWalls = () => useMapStore((state) => state.document.walls);
export const useConnections = () =>
  useMapStore((state) => state.document.connections);

export const useCurrentBuildingId = () =>
  useMapUiStore((state) => state.currentBuildingId);
export const useCurrentFloorId = () =>
  useMapUiStore((state) => state.currentFloorId);
export const useSelectedDeviceId = () =>
  useMapUiStore((state) => state.selectedDeviceId);
export const useHoveredDeviceId = () =>
  useMapUiStore((state) => state.hoveredDeviceId);
export const useIsEditMode = () => useMapUiStore((state) => state.isEditMode);
export const useActiveDrawTool = () =>
  useMapUiStore((state) => state.activeDrawTool);
export const useSelectedWallColor = () =>
  useMapUiStore((state) => state.selectedWallColor);
export const useHighlightedDeviceIds = () =>
  useMapUiStore((state) => state.highlightedDeviceIds);

export const useIsDeviceSelected = (id: string) =>
  useMapUiStore((state) => state.selectedDeviceId === id);
export const useIsDeviceHighlighted = (id: string) =>
  useMapUiStore((state) => state.highlightedDeviceIdSet.has(id));
