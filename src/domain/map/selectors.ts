import type {
  Building,
  Connection,
  Device,
  Floor,
  MapDocument,
  WallSegment,
} from "@/types/map";

export const getBuildingById = (
  document: MapDocument,
  buildingId: string,
): Building | undefined =>
  document.buildings.find((building) => building.id === buildingId);

export const getFloorById = (
  document: MapDocument,
  floorId: string,
): Floor | undefined => {
  for (const building of document.buildings) {
    const floor = building.floors.find((candidate) => candidate.id === floorId);
    if (floor) {
      return floor;
    }
  }

  return undefined;
};

export const getDeviceById = (
  document: MapDocument,
  deviceId: string,
): Device | undefined =>
  document.devices.find((device) => device.id === deviceId);

export const getConnectionById = (
  document: MapDocument,
  connectionId: string,
): Connection | undefined =>
  document.connections.find((connection) => connection.id === connectionId);

export const getDevicesForFloor = (
  document: MapDocument,
  floorId: string,
): Array<Device> =>
  document.devices.filter((device) => device.floorId === floorId);

export const getWallsForFloor = (
  document: MapDocument,
  floorId: string,
): Array<WallSegment> =>
  document.walls.filter((wall) => wall.floorId === floorId);

export const getConnectionsForDevice = (
  document: MapDocument,
  deviceId: string,
): Array<Connection> =>
  document.connections.filter(
    (connection) =>
      connection.a.deviceId === deviceId || connection.b.deviceId === deviceId,
  );

export const getConnectedDeviceIds = (
  document: MapDocument,
  deviceId: string,
): Array<string> => {
  const connectedIds = new Set<string>();

  for (const connection of getConnectionsForDevice(document, deviceId)) {
    if (connection.a.deviceId === deviceId) {
      connectedIds.add(connection.b.deviceId);
    } else {
      connectedIds.add(connection.a.deviceId);
    }
  }

  return [...connectedIds];
};
