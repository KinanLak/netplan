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
