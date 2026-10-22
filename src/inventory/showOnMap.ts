import type { useNavigate } from "@tanstack/react-router";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { useMapStore } from "@/store/useMapStore";

/** Opens the map on a device's floor with the device selected. */
export function showOnMap(
  navigate: ReturnType<typeof useNavigate>,
  siteId: string,
  deviceId: string,
  location: { buildingId: string; floorId: string },
) {
  const { setCurrentBuilding, setCurrentFloor, selectDevice } =
    useMapStore.getState();
  setCurrentBuilding(asBuildingId(location.buildingId));
  setCurrentFloor(asFloorId(location.floorId));
  selectDevice(asDeviceId(deviceId));
  void navigate({
    to: "/",
    search: { site: siteId, floor: location.floorId, device: deviceId },
  });
}

/**
 * Opens the map, in edit mode, with « Placer » on a device that is on no
 * floor (B23): it lands on the floor the reader last had open.
 */
export function openPlacement(
  navigate: ReturnType<typeof useNavigate>,
  siteId: string,
  deviceId: string,
) {
  useMapStore.getState().setPlacePanelOpen(true, deviceId);
  void navigate({ to: "/", search: { site: siteId } });
}
