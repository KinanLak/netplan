import type { Connection, MapDocument } from "@/types/map";
import type {
  AddConnectionInput,
  ConnectionCommandFailureReason,
  DeleteConnectionInput,
  MapCommandResult,
} from "@/domain/map/types";
import { assertPortExists } from "@/domain/map/invariants";
import { getConnectionById, getDeviceById } from "@/domain/map/selectors";

const areEndpointsEqual = (a: Connection["a"], b: Connection["b"]) =>
  a.deviceId === b.deviceId && a.portId === b.portId;

const isDuplicateConnection = (
  connections: Array<Connection>,
  nextConnection: Omit<Connection, "id">,
) =>
  connections.some(
    (connection) =>
      (areEndpointsEqual(connection.a, nextConnection.a) &&
        areEndpointsEqual(connection.b, nextConnection.b)) ||
      (areEndpointsEqual(connection.a, nextConnection.b) &&
        areEndpointsEqual(connection.b, nextConnection.a)),
  );

export const addConnection = (
  document: MapDocument,
  { connection, connectionId }: AddConnectionInput,
): MapCommandResult<ConnectionCommandFailureReason> => {
  const deviceA = getDeviceById(document, connection.a.deviceId);
  const deviceB = getDeviceById(document, connection.b.deviceId);

  if (!deviceA || !deviceB) {
    return { ok: false, document, reason: "device-not-found" };
  }

  if (areEndpointsEqual(connection.a, connection.b)) {
    return { ok: false, document, reason: "same-endpoint" };
  }

  if (
    deviceA.floorId !== deviceB.floorId ||
    deviceA.floorId !== connection.floorId
  ) {
    return { ok: false, document, reason: "cross-floor" };
  }

  try {
    if (connection.a.portId) {
      assertPortExists(document, connection.a.deviceId, connection.a.portId);
    }

    if (connection.b.portId) {
      assertPortExists(document, connection.b.deviceId, connection.b.portId);
    }
  } catch {
    return { ok: false, document, reason: "port-not-found" };
  }

  if (isDuplicateConnection(document.connections, connection)) {
    return { ok: false, document, reason: "duplicate-connection" };
  }

  const nextConnection: Connection = {
    ...connection,
    id: connectionId ?? `connection-${crypto.randomUUID()}`,
  };

  return {
    ok: true,
    document: {
      ...document,
      connections: [...document.connections, nextConnection],
    },
    affectedIds: [nextConnection.id],
    reason: "applied",
  };
};

export const deleteConnection = (
  document: MapDocument,
  { connectionId }: DeleteConnectionInput,
): MapCommandResult<ConnectionCommandFailureReason> => {
  const connection = getConnectionById(document, connectionId);
  if (!connection) {
    return { ok: false, document, reason: "connection-not-found" };
  }

  return {
    ok: true,
    document: {
      ...document,
      connections: document.connections.filter(
        (candidate) => candidate.id !== connectionId,
      ),
    },
    affectedIds: [connectionId],
    reason: "applied",
  };
};
