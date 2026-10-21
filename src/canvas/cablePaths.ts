// The cable path a device shows on its floor (ADR 0025), traced in the
// browser from the floor document by the rules of `traceFrom`: through patch
// panels, stopping at an interface, a wall socket, a loop, or a rear port
// several front ports share. A hop off the floor ends the path on a label.
import { MAX_TRACE_HOPS } from "@/devices/ports";
import { portLabel, portState, shownPorts } from "@/devices/portState";
import type { PortState } from "@/devices/portState";
import type { Cable, Device, DeviceId, Port, PortId } from "@/types/map";

/** The devices whose path shows when hovered or selected. */
export const TRACED_ON_HOVER: ReadonlySet<Device["type"]> = new Set([
  "pc",
  "endpoint",
  "wall-port",
]);

/**
 * The devices whose paths show only when asked: a switch or a patch panel
 * carries too many cables to show them unasked.
 */
export const TRACED_ON_ASK: ReadonlySet<Device["type"]> = new Set([
  "switch",
  "patch-panel",
]);

/**
 * The device whose cables show after "Voir les câbles sur le plan" on `target`:
 * asking again hides them, and asking on another switch or patch panel
 * shows its own instead. Asking on any other device, or on none, hides them.
 */
export const toggledCableDisplay = (
  shown: DeviceId | null,
  target: Pick<Device, "id" | "type"> | undefined,
): DeviceId | null =>
  target && TRACED_ON_ASK.has(target.type) && target.id !== shown
    ? target.id
    : null;

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

/**
 * What a drawn cable says about its link (ADR 0029): live when the switch
 * port it leads to has its link up or sees a device, down when that link is
 * down, unknown when nothing observes it.
 */
export type CableState = "live" | "down" | "unknown";

const CABLE_STATES: Record<PortState, CableState> = {
  seen: "live",
  up: "live",
  down: "down",
  unknown: "unknown",
};

/** A cable between two devices of the floor, and the ports it joins. */
export type PathCable = {
  id: string;
  from: DeviceId;
  fromPort: PortId;
  to: DeviceId;
  toPort: PortId;
  state: CableState;
};

export type CablePath = {
  /** Each cable between two devices of the floor, once. */
  cables: Array<PathCable>;
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

/** The strongest observation of the ports at a trace's two ends. */
const strongest = (ports: ReadonlyArray<Port>): CableState => {
  const states = new Set(ports.map((port) => portState(port)));
  for (const state of ["seen", "up", "down"] as const) {
    if (states.has(state)) return CABLE_STATES[state];
  }
  return "unknown";
};

/** The port on the other side of a patch panel's port, if one only. */
const passedThrough = (port: Port, floor: FloorCabling): Port | undefined => {
  if (port.kind === "front") {
    return port.rearPortId === undefined
      ? undefined
      : floor.ports.get(port.rearPortId);
  }
  if (port.kind !== "rear") return undefined;
  const fronts = floor.frontsOf.get(port.id) ?? [];
  return fronts.length === 1 ? fronts[0] : undefined;
};

const traceInto = (start: Port, floor: FloorCabling, path: CablePath) => {
  // Each cable of one trace shows the state of the link at its switch end.
  // A trace that starts on a patch panel's port looks behind the panel too,
  // where the switch may be, without drawing that side twice.
  const cables: Array<Omit<PathCable, "state">> = [];
  const last = walk(start, floor, path, cables);
  const behind = passedThrough(start, floor);
  const lastBehind = behind
    ? walk(behind, floor, { cables: [], sightings: [], ends: [] }, [])
    : undefined;
  const state = strongest(
    [start, last, behind, lastBehind].filter((port) => port !== undefined),
  );
  path.cables.push(...cables.map((cable) => ({ ...cable, state })));
};

/** Follows `start`'s cables; returns the port the trace ends on, if any. */
const walk = (
  start: Port,
  floor: FloorCabling,
  path: CablePath,
  cables: Array<Omit<PathCable, "state">>,
): Port | undefined => {
  // A miscabled panel may lead back where the trace has been.
  const seen = new Set<string>([start.id]);
  let at = start;
  for (let hop = 0; hop < MAX_TRACE_HOPS; hop += 1) {
    const cable = floor.cableAt.get(at.id);
    if (!cable) return undefined;
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
      return undefined;
    }
    if (seen.has(far.id)) return undefined;
    seen.add(far.id);
    cables.push({
      id: cable.id,
      from: at.deviceId,
      fromPort: at.id,
      to: far.deviceId,
      toPort: far.id,
    });
    if (far.kind === "interface") {
      path.ends.push({
        kind: "port",
        at: far.deviceId,
        portName: portLabel(far),
      });
      return far;
    }
    if (floor.devices.get(far.deviceId)?.type === "wall-port") {
      sightingsAt(far.deviceId, floor, path);
      return far;
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
          portName: portLabel(far),
        });
        return far;
      }
      through = fronts[0];
    }
    if (!through) {
      // The trace ends on this port, as `traceFrom` does: a switch NetBox
      // models with rear ports, or a panel port patched to nothing behind.
      path.ends.push({
        kind: "port",
        at: far.deviceId,
        portName: portLabel(far),
      });
      return far;
    }
    if (seen.has(through.id)) return undefined;
    seen.add(through.id);
    at = through;
  }
  return undefined;
};

/** Each item the first time its key comes up. */
const once = <T>(items: ReadonlyArray<T>, key: (item: T) => string) => {
  const keys = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (keys.has(k)) return false;
    keys.add(k);
    return true;
  });
};

const labelOf = (end: Exclude<PathEnd, { kind: "port" }>): string => {
  switch (end.kind) {
    case "shared":
      return `${end.portName} · partagé`;
    case "away":
      return `${end.deviceName} · ${end.portName} (${end.floorName ?? "hors plan"})`;
    case "seen-away":
      return `Vu à ${end.socketName} (${end.floorName ?? "hors plan"})`;
  }
};

/** Beyond this, the ports a path reaches on one device show as a count. */
const PORT_NAMES_SHOWN = 3;

/**
 * The labels under each device where paths end. The ports reached on one
 * device share a label, so a patch panel's paths do not stack a label per
 * port under its switch.
 */
export const endLabels = (
  ends: ReadonlyArray<PathEnd>,
): Map<DeviceId, Array<string>> => {
  const labels = new Map<DeviceId, Array<string>>();
  for (const [at, atEnds] of Map.groupBy(ends, (end) => end.at)) {
    const ports = atEnds.flatMap((end) =>
      end.kind === "port" ? [end.portName] : [],
    );
    labels.set(at, [
      ...(ports.length === 0
        ? []
        : [
            ports.length <= PORT_NAMES_SHOWN
              ? ports.join(", ")
              : `${ports.length} ports`,
          ]),
      ...atEnds.flatMap((end) => (end.kind === "port" ? [] : [labelOf(end)])),
    ]);
  }
  return labels;
};

/** Several paths drawn together, each cable, sighting and end once. */
export const mergedPaths = (paths: ReadonlyArray<CablePath>): CablePath => ({
  cables: once(
    paths.flatMap((path) => path.cables),
    ({ id }) => id,
  ),
  sightings: once(
    paths.flatMap((path) => path.sightings),
    ({ deviceId }) => deviceId,
  ),
  ends: once(
    paths.flatMap((path) => path.ends),
    (end) => JSON.stringify(end),
  ),
});

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
  return mergedPaths([path]);
};

/** The handle a status dot carries, where a device's cables and sightings start. */
export const STATUS_HANDLE = "status";
/** The handle on a wall socket's icon. */
export const SOCKET_HANDLE = "socket";

/**
 * The handle of the node where a cable reaches `port` (ADR 0029): a PC's or
 * an endpoint's status dot, a socket's icon, or the port itself on a switch
 * or a patch panel. A rear port behind one front port shows as that front
 * port. `null` lets React Flow take the node's first handle.
 */
export const cableHandleOf = (
  port: Port,
  floor: FloorCabling,
): string | null => {
  switch (floor.devices.get(port.deviceId)?.type) {
    case "pc":
    case "endpoint":
      return STATUS_HANDLE;
    case "wall-port":
      return SOCKET_HANDLE;
    case undefined:
    case "rack":
      return null;
    default: {
      const shown = shownPorts(floor.portsOf.get(port.deviceId) ?? []);
      if (shown.some(({ id }) => id === port.id)) return port.id;
      const fronts = floor.frontsOf.get(port.id) ?? [];
      return fronts.length === 1 ? fronts[0].id : null;
    }
  }
};

/** A drawn cable or sighting, as an edge between two handles. */
export type PathEdge = {
  id: string;
  source: DeviceId;
  sourceHandle: string | null;
  target: DeviceId;
  targetHandle: string | null;
  state: CableState | "sighting";
};

/** The edges that draw `path`: each cable between its ports, each sighting dashed. */
export const pathEdges = (
  path: CablePath,
  floor: FloorCabling,
): Array<PathEdge> => {
  const handleOf = (portId: PortId) => {
    const port = floor.ports.get(portId);
    return port ? cableHandleOf(port, floor) : null;
  };
  return [
    ...path.cables.map((cable) => ({
      id: `cable:${cable.id}`,
      source: cable.from,
      sourceHandle: handleOf(cable.fromPort),
      target: cable.to,
      targetHandle: handleOf(cable.toPort),
      state: cable.state,
    })),
    ...path.sightings.map(({ deviceId, socketId }) => ({
      id: `seen:${deviceId}`,
      source: deviceId,
      sourceHandle: STATUS_HANDLE,
      target: socketId,
      targetHandle: SOCKET_HANDLE,
      state: "sighting" as const,
    })),
  ];
};

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

/** The gap between a device and the labels under or over it. */
export const LABEL_GAP = 4;

/**
 * Where the labels of a path end go around `box`, in flow units: under it,
 * else over it, or nowhere when both would cover another device (A102).
 */
export const labelPlacement = (
  box: Box,
  labels: { width: number; height: number },
  obstacles: ReadonlyArray<Box>,
): "below" | "above" | null => {
  const x = box.x + box.width / 2 - labels.width / 2;
  const below = {
    x,
    y: box.y + box.height + LABEL_GAP,
    ...labels,
  };
  const above = {
    x,
    y: box.y - LABEL_GAP - labels.height,
    ...labels,
  };
  if (!obstacles.some((obstacle) => overlaps(below, obstacle))) return "below";
  if (!obstacles.some((obstacle) => overlaps(above, obstacle))) return "above";
  return null;
};
