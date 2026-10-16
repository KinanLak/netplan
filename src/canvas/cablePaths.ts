// The cable path a device shows on its floor (ADR 0025), traced in the
// browser from the floor document by the rules of `traceFrom`: through patch
// panels, stopping at an interface, a wall socket, a loop, or a rear port
// several front ports share. A hop off the floor ends the path on a label.
import { MAX_TRACE_HOPS } from "@/devices/ports";
import type { Cable, Device, DeviceId, Port } from "@/types/map";

/** Where the network last saw a `pc` or `endpoint` of the floor. */
export type SeenAt = {
  deviceId: string;
  socketId: string;
  socketName: string;
  floorName: string | null;
};

/** The end, off the floor, of a cable that leaves it. */
export type FarEnd = {
  portId: string;
  portName: string;
  deviceId: string;
  deviceName: string;
  floorName: string | null;
};

/**
 * Where a path ends, on the device it is drawn to: the port it reaches, a
 * rear port it cannot see past, the port of a device on another floor, or
 * a socket on another floor where the device was seen.
 */
export type PathEnd =
  | { kind: "port"; at: DeviceId; portName: string }
  | { kind: "shared"; at: DeviceId; portName: string }
  | {
      kind: "away";
      at: DeviceId;
      deviceName: string;
      portName: string;
      floorName: string | null;
    }
  | {
      kind: "seen-away";
      at: DeviceId;
      socketName: string;
      floorName: string | null;
    };

export type CablePath = {
  /** Each cable between two devices of the floor, once. */
  cables: Array<{ id: string; from: DeviceId; to: DeviceId }>;
  /** A device and the socket where the network last saw it, dashed. */
  sightings: Array<{ deviceId: DeviceId; socketId: DeviceId }>;
  ends: Array<PathEnd>;
};

export const EMPTY_PATH: CablePath = { cables: [], sightings: [], ends: [] };

/** The floor as a trace walks it. */
export type FloorCabling = {
  devices: ReadonlyMap<DeviceId, Pick<Device, "id" | "type">>;
  ports: ReadonlyMap<string, Port>;
  portsOf: ReadonlyMap<DeviceId, ReadonlyArray<Port>>;
  cableAt: ReadonlyMap<string, Cable>;
  frontsOf: ReadonlyMap<string, ReadonlyArray<Port>>;
  seenAt: ReadonlyMap<string, SeenAt>;
  seenHere: ReadonlyMap<string, ReadonlyArray<SeenAt>>;
  farEnds: ReadonlyMap<string, FarEnd>;
};

/** Indexes a floor's devices, ports, cables and path ends for tracing. */
export const floorCabling = (
  devices: ReadonlyArray<Pick<Device, "id" | "type">>,
  ports: ReadonlyArray<Port>,
  cables: ReadonlyArray<Cable>,
  ends: { seenAt: ReadonlyArray<SeenAt>; farEnds: ReadonlyArray<FarEnd> },
): FloorCabling => {
  const deviceById = new Map(devices.map((device) => [device.id, device]));
  const onFloor = ports.filter((port) => deviceById.has(port.deviceId));
  const cableAt = new Map<string, Cable>();
  for (const cable of cables) {
    cableAt.set(cable.a.portId, cable);
    cableAt.set(cable.b.portId, cable);
  }
  return {
    devices: deviceById,
    ports: new Map(onFloor.map((port) => [port.id, port])),
    portsOf: Map.groupBy(onFloor, (port) => port.deviceId),
    cableAt,
    frontsOf: Map.groupBy(
      onFloor.filter((port) => port.rearPortId !== undefined),
      (port) => port.rearPortId ?? "",
    ),
    seenAt: new Map(ends.seenAt.map((seen) => [seen.deviceId, seen])),
    seenHere: Map.groupBy(ends.seenAt, (seen) => seen.socketId),
    farEnds: new Map(ends.farEnds.map((far) => [far.portId, far])),
  };
};

/** The devices the network located at a socket of the floor. */
const sightingsAt = (
  socketId: DeviceId,
  floor: FloorCabling,
  path: CablePath,
) => {
  for (const here of floor.seenHere.get(socketId) ?? []) {
    const deviceId = here.deviceId as DeviceId;
    if (floor.devices.has(deviceId)) {
      path.sightings.push({ deviceId, socketId });
    }
  }
};

const traceInto = (start: Port, floor: FloorCabling, path: CablePath) => {
  // A miscabled panel may lead back where the trace has been.
  const seen = new Set<string>([start.id]);
  let at = start;
  for (let hop = 0; hop < MAX_TRACE_HOPS; hop += 1) {
    const cable = floor.cableAt.get(at.id);
    if (!cable) return;
    const farEnd = cable.a.portId === at.id ? cable.b : cable.a;
    const far = floor.ports.get(farEnd.portId);
    if (!far) {
      const away = floor.farEnds.get(farEnd.portId);
      if (away) {
        path.ends.push({
          kind: "away",
          at: at.deviceId,
          deviceName: away.deviceName,
          portName: away.portName,
          floorName: away.floorName,
        });
      }
      return;
    }
    if (seen.has(far.id)) return;
    seen.add(far.id);
    path.cables.push({ id: cable.id, from: at.deviceId, to: far.deviceId });
    if (far.kind === "interface") {
      path.ends.push({ kind: "port", at: far.deviceId, portName: far.name });
      return;
    }
    if (floor.devices.get(far.deviceId)?.type === "wall-port") {
      sightingsAt(far.deviceId, floor, path);
      return;
    }
    let through: Port | undefined;
    if (far.kind === "front") {
      through =
        far.rearPortId === undefined
          ? undefined
          : floor.ports.get(far.rearPortId);
    } else {
      const fronts = floor.frontsOf.get(far.id) ?? [];
      if (fronts.length > 1) {
        path.ends.push({
          kind: "shared",
          at: far.deviceId,
          portName: far.name,
        });
        return;
      }
      through = fronts[0];
    }
    if (!through) {
      // The trace ends on this port, as `traceFrom` does: a switch NetBox
      // models with rear ports, or a panel port patched to nothing behind.
      path.ends.push({ kind: "port", at: far.deviceId, portName: far.name });
      return;
    }
    if (seen.has(through.id)) return;
    seen.add(through.id);
    at = through;
  }
};

/** Each item the first time its key comes up. */
const once = <T>(items: Array<T>, key: (item: T) => string) => {
  const keys = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
};

/**
 * The path a device shows: its cables, followed to where they end. A device
 * the network located at a socket starts with a dashed segment to it, then
 * the socket's cables; a socket, and a trace that reaches one, shows the
 * devices seen at it.
 */
export const cablePathOf = (
  deviceId: DeviceId,
  floor: FloorCabling,
): CablePath => {
  if (!floor.devices.has(deviceId)) return EMPTY_PATH;
  const path: CablePath = { cables: [], sightings: [], ends: [] };
  const starts = [...(floor.portsOf.get(deviceId) ?? [])];

  const seen = floor.seenAt.get(deviceId);
  if (seen) {
    const socketId = seen.socketId as DeviceId;
    if (floor.devices.has(socketId)) {
      path.sightings.push({ deviceId, socketId });
      starts.push(...(floor.portsOf.get(socketId) ?? []));
    } else {
      path.ends.push({
        kind: "seen-away",
        at: deviceId,
        socketName: seen.socketName,
        floorName: seen.floorName,
      });
    }
  }
  sightingsAt(deviceId, floor, path);

  for (const start of starts) traceInto(start, floor, path);
  return {
    cables: once(path.cables, ({ id }) => id),
    sightings: once(path.sightings, ({ deviceId: id }) => id),
    ends: once(path.ends, (end) => JSON.stringify(end)),
  };
};
