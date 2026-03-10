import type { Device, MapDocument } from "@/types/map";
import type {
  AddDeviceInput,
  DeleteDeviceInput,
  DeviceCommandFailureReason,
  MapCommandResult,
  MoveDeviceInput,
} from "@/domain/map/types";
import {
  assertFloorExists,
  checkDeviceCollision,
  removeConnectionsForDevice,
} from "@/domain/map/invariants";
import { getDeviceById } from "@/domain/map/selectors";

const resolveCandidatePositions = (
  device: Omit<Device, "id">,
  candidatePositions?: Array<Device["position"]>,
): Array<Device["position"]> =>
  candidatePositions && candidatePositions.length > 0
    ? candidatePositions
    : [device.position];

export const addDevice = (
  document: MapDocument,
  { device, candidatePositions, deviceId }: AddDeviceInput,
): MapCommandResult<DeviceCommandFailureReason> => {
  try {
    assertFloorExists(document, device.floorId);
  } catch {
    return { ok: false, document, reason: "floor-not-found" };
  }

  const id = deviceId ?? `device-${crypto.randomUUID()}`;
  const positions = resolveCandidatePositions(device, candidatePositions);

  for (const position of positions) {
    const hasCollision = checkDeviceCollision(document, {
      floorId: device.floorId,
      deviceId: id,
      position,
      size: device.size,
    });

    if (hasCollision) {
      continue;
    }

    const nextDevice: Device = {
      ...device,
      id,
      position,
    };

    return {
      ok: true,
      document: {
        ...document,
        devices: [...document.devices, nextDevice],
      },
      affectedIds: [id],
      reason: "applied",
    };
  }

  return { ok: false, document, reason: "no-valid-position" };
};

export const moveDevice = (
  document: MapDocument,
  { deviceId, floorId, position }: MoveDeviceInput,
): MapCommandResult<DeviceCommandFailureReason> => {
  const device = getDeviceById(document, deviceId);
  if (!device) {
    return { ok: false, document, reason: "device-not-found" };
  }

  if (device.floorId !== floorId) {
    return { ok: false, document, reason: "floor-mismatch" };
  }

  const hasCollision = checkDeviceCollision(document, {
    floorId,
    deviceId,
    position,
    size: device.size,
  });

  if (hasCollision) {
    return { ok: false, document, reason: "collision" };
  }

  return {
    ok: true,
    document: {
      ...document,
      devices: document.devices.map((candidate) =>
        candidate.id === deviceId ? { ...candidate, position } : candidate,
      ),
    },
    affectedIds: [deviceId],
    reason: "applied",
  };
};

export const deleteDevice = (
  document: MapDocument,
  { deviceId }: DeleteDeviceInput,
): MapCommandResult<DeviceCommandFailureReason> => {
  const device = getDeviceById(document, deviceId);
  if (!device) {
    return { ok: false, document, reason: "device-not-found" };
  }

  const { connections, removedConnectionIds } = removeConnectionsForDevice(
    document,
    deviceId,
  );

  return {
    ok: true,
    document: {
      ...document,
      devices: document.devices.filter(
        (candidate) => candidate.id !== deviceId,
      ),
      connections,
    },
    affectedIds: [deviceId, ...removedConnectionIds],
    reason: "applied",
  };
};
