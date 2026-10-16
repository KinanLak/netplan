import type { DeviceId, MapDocumentSnapshot, MapStore } from "@/types/map";

export type EphemeralStatePatch = Partial<
  Pick<
    MapStore,
    | "selectedDeviceId"
    | "selectedDeviceIds"
    | "selectedDeviceIdSet"
    | "hoveredDeviceId"
    | "shownCablesDeviceId"
  >
>;

const toIdSet = (deviceIds: Array<DeviceId>): ReadonlySet<DeviceId> =>
  deviceIds.length === 0 ? new Set<DeviceId>() : new Set(deviceIds);

export function reconcileEphemeralState(
  snapshot: MapDocumentSnapshot,
  state: Pick<
    MapStore,
    | "selectedDeviceId"
    | "selectedDeviceIds"
    | "hoveredDeviceId"
    | "shownCablesDeviceId"
  >,
): EphemeralStatePatch | null {
  const deviceIds = new Set(snapshot.devices.map((device) => device.id));
  const patch: EphemeralStatePatch = {};

  if (state.selectedDeviceId && !deviceIds.has(state.selectedDeviceId)) {
    patch.selectedDeviceId = null;
  }

  const selectedDeviceIds = state.selectedDeviceIds.filter((id) =>
    deviceIds.has(id),
  );
  if (selectedDeviceIds.length !== state.selectedDeviceIds.length) {
    patch.selectedDeviceIds = selectedDeviceIds;
    patch.selectedDeviceIdSet = toIdSet(selectedDeviceIds);
    patch.selectedDeviceId =
      selectedDeviceIds.length === 1 ? selectedDeviceIds[0] : null;
  }

  if (state.hoveredDeviceId && !deviceIds.has(state.hoveredDeviceId)) {
    patch.hoveredDeviceId = null;
  }

  if (state.shownCablesDeviceId && !deviceIds.has(state.shownCablesDeviceId)) {
    patch.shownCablesDeviceId = null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
