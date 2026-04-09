import type { Connection, Device, MapDocument, PortInfo } from "@/types/map";
import type { CheckDeviceCollisionInput } from "@/domain/map/types";
import { rectanglesOverlap } from "@/lib/geometry";
import { getWallRect } from "@/lib/walls";
import {
  getConnectedDeviceIds,
  getDeviceById,
  getDevicesForFloor,
  getFloorById,
  getWallsForFloor,
} from "@/domain/map/selectors";

export const assertDeviceExists = (
  document: MapDocument,
  deviceId: string,
): Device => {
  const device = getDeviceById(document, deviceId);
  if (!device) {
    throw new Error(`Device not found: ${deviceId}`);
  }

  return device;
};

export const assertPortExists = (
  document: MapDocument,
  deviceId: string,
  portId: string,
): PortInfo => {
  const device = assertDeviceExists(document, deviceId);
  const port = device.metadata.ports?.find(
    (candidate) => candidate.id === portId,
  );

  if (!port) {
    throw new Error(`Port not found: ${deviceId}:${portId}`);
  }

  return port;
};

const areConnectionEndpointsEqual = (a: Connection["a"], b: Connection["b"]) =>
  a.deviceId === b.deviceId && a.portId === b.portId;

export const assertNoDanglingConnectionRefs = (document: MapDocument): void => {
  for (const connection of document.connections) {
    const deviceA = assertDeviceExists(document, connection.a.deviceId);
    const deviceB = assertDeviceExists(document, connection.b.deviceId);

    if (connection.a.portId) {
      assertPortExists(document, connection.a.deviceId, connection.a.portId);
    }

    if (connection.b.portId) {
      assertPortExists(document, connection.b.deviceId, connection.b.portId);
    }

    if (areConnectionEndpointsEqual(connection.a, connection.b)) {
      throw new Error(`Connection endpoints must differ: ${connection.id}`);
    }

    if (
      deviceA.floorId !== deviceB.floorId ||
      deviceA.floorId !== connection.floorId
    ) {
      throw new Error(`Connection floor mismatch: ${connection.id}`);
    }
  }
};

export const checkDeviceCollision = (
  document: MapDocument,
  { floorId, deviceId, position, size }: CheckDeviceCollisionInput,
): boolean => {
  for (const device of getDevicesForFloor(document, floorId)) {
    if (device.id === deviceId) {
      continue;
    }

    if (rectanglesOverlap(position, size, device.position, device.size)) {
      return true;
    }
  }

  for (const wall of getWallsForFloor(document, floorId)) {
    const rect = getWallRect(wall);
    if (
      rectanglesOverlap(
        position,
        size,
        { x: rect.x, y: rect.y },
        { width: rect.width, height: rect.height },
      )
    ) {
      return true;
    }
  }

  return false;
};

export const removeConnectionsForDevice = (
  document: MapDocument,
  deviceId: string,
): {
  connections: Array<Connection>;
  removedConnectionIds: Array<string>;
} => {
  const removedConnectionIds = getConnectedDeviceIds(
    document,
    deviceId,
  ).flatMap((connectedDeviceId) =>
    document.connections
      .filter(
        (connection) =>
          (connection.a.deviceId === deviceId &&
            connection.b.deviceId === connectedDeviceId) ||
          (connection.b.deviceId === deviceId &&
            connection.a.deviceId === connectedDeviceId),
      )
      .map((connection) => connection.id),
  );
  const removedConnectionIdSet = new Set(removedConnectionIds);

  return {
    connections: document.connections.filter(
      (connection) => !removedConnectionIdSet.has(connection.id),
    ),
    removedConnectionIds,
  };
};

export const assertFloorExists = (
  document: MapDocument,
  floorId: string,
): void => {
  if (!getFloorById(document, floorId)) {
    throw new Error(`Floor not found: ${floorId}`);
  }
};
