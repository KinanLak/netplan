// Ports and cables (ADR 0022), shared by the map engine and Convex, which
// bundles this file: relative imports only.
import type {
  Cable,
  DeviceId,
  DeviceType,
  Port,
  PortId,
  PortKind,
} from "../types/map";

export const MAX_PORTS_PER_DEVICE = 256;
export const PORT_NAME_MAX_LENGTH = 64;

const PORT_KINDS: ReadonlyArray<PortKind> = ["interface", "front", "rear"];

/** The id of a device's `n`th port of a kind, as Netplan names its own. */
export const portIdOf = (
  deviceId: DeviceId,
  kind: PortKind,
  n: number,
): PortId => `port:${deviceId}:${kind}:${n}` as PortId;

/**
 * `count` ports of one kind numbered from 1; front ports come with the rear
 * port each passes through to.
 */
export const numberedPorts = (
  deviceId: DeviceId,
  kind: "interface" | "front",
  count: number,
  name: (n: number) => string = String,
): Array<Port> => {
  const ports: Array<Port> = [];
  for (let n = 1; n <= count; n += 1) {
    ports.push({
      id: portIdOf(deviceId, kind, n),
      deviceId,
      name: name(n),
      kind,
      order: n,
      ...(kind === "front"
        ? { rearPortId: portIdOf(deviceId, "rear", n) }
        : {}),
    });
  }
  if (kind === "front") {
    for (let n = 1; n <= count; n += 1) {
      ports.push({
        id: portIdOf(deviceId, "rear", n),
        deviceId,
        name: name(n),
        kind: "rear",
        order: n,
      });
    }
  }
  return ports;
};

/**
 * The ports a manual device starts with. A wall socket has one front port
 * with no rear: a trace stops there, and what plugs into it is located by
 * the network rather than cabled.
 */
export const defaultPorts = (
  deviceId: DeviceId,
  type: DeviceType,
): Array<Port> => {
  switch (type) {
    case "switch":
      return numberedPorts(deviceId, "interface", 24);
    case "patch-panel":
      return numberedPorts(deviceId, "front", 24);
    case "wall-port":
      return [
        {
          id: portIdOf(deviceId, "front", 1),
          deviceId,
          name: "1",
          kind: "front",
          order: 1,
        },
      ];
    case "pc":
    case "endpoint":
      return numberedPorts(deviceId, "interface", 1);
    case "rack":
      return [];
  }
};

const ID_BODY = /^[\w:./-]{1,200}$/;
const CABLE_ID = /^cable:[\w:./-]{1,200}$/;

export const isCableId = (id: string): boolean => CABLE_ID.test(id);

/**
 * Port ids start with their device's, so a new device's ports cannot take
 * the id of another's.
 */
const isPortIdOf = (deviceId: string, id: string): boolean => {
  const prefix = `port:${deviceId}:`;
  return id.startsWith(prefix) && ID_BODY.test(id.slice(prefix.length));
};

// The rules below take plain strings, so Convex can apply them to what its
// validators hand it.
type PortShape = Pick<Port, "name" | "kind" | "order"> & {
  id: string;
  deviceId: string;
  rearPortId?: string;
};
type CableShape = {
  id: string;
  a: { deviceId: string; portId: string };
  b: { deviceId: string; portId: string };
};

/** Why a device's port list is unacceptable, or `null`. */
export const portListError = (
  deviceId: string,
  ports: ReadonlyArray<PortShape>,
): string | null => {
  if (ports.length > MAX_PORTS_PER_DEVICE) return "Too many ports";
  const byId = new Map<string, PortShape>();
  for (const port of ports) {
    if (!isPortIdOf(deviceId, port.id)) return "Invalid port id";
    if (byId.has(port.id)) return "Duplicate port id";
    byId.set(port.id, port);
  }
  for (const port of ports) {
    if (port.deviceId !== deviceId) return "Port belongs to another device";
    if (!PORT_KINDS.includes(port.kind)) return "Invalid port kind";
    const name = port.name.trim();
    if (!name || name !== port.name) return "Invalid port name";
    if (name.length > PORT_NAME_MAX_LENGTH) return "Port name too long";
    if (!Number.isSafeInteger(port.order) || port.order < 0) {
      return "Invalid port order";
    }
    if (port.rearPortId !== undefined) {
      if (port.kind !== "front") return "Only a front port has a rear port";
      if (byId.get(port.rearPortId)?.kind !== "rear") {
        return "Rear port not found";
      }
    }
  }
  return null;
};

const KIND_RANK: Record<PortKind, number> = { interface: 0, front: 1, rear: 2 };

/** Interfaces, then front ports, then rear ports, each in their order. */
export const comparePorts = (
  a: Pick<Port, "kind" | "order">,
  b: Pick<Port, "kind" | "order">,
): number => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.order - b.order;

/** Each device's ports, in display order. */
export const portsByDevice = (
  ports: ReadonlyArray<Port>,
): Map<DeviceId, Array<Port>> => {
  const grouped = new Map<DeviceId, Array<Port>>();
  for (const port of ports) {
    const list = grouped.get(port.deviceId);
    if (list) list.push(port);
    else grouped.set(port.deviceId, [port]);
  }
  for (const list of grouped.values()) list.sort(comparePorts);
  return grouped;
};

export const cableTouches = (cable: Cable, deviceId: DeviceId): boolean =>
  cable.a.deviceId === deviceId || cable.b.deviceId === deviceId;

/** The devices cabled directly to `deviceId`, each once, in cable order. */
export const cabledDeviceIds = (
  cables: ReadonlyArray<Cable>,
  deviceId: DeviceId,
): Array<DeviceId> => {
  const seen = new Set<DeviceId>();
  for (const cable of cables) {
    const other =
      cable.a.deviceId === deviceId
        ? cable.b.deviceId
        : cable.b.deviceId === deviceId
          ? cable.a.deviceId
          : null;
    if (other && other !== deviceId) seen.add(other);
  }
  return [...seen];
};

type CableEnd = CableShape["a"];

/**
 * The cables a new device lays, or why its list is malformed. A cable must
 * plug into one of the device's `ownPortIds`; one whose far end has gone,
 * or holds another cable since, is left out rather than refused, so undoing
 * a deletion always brings the device back with what still fits.
 * `farPortOf` finds a port of another device, `isCabled` and `cableExists`
 * describe the site as it stands.
 */
export const cablesToLay = <C extends CableShape>(
  deviceId: string,
  ownPortIds: ReadonlySet<string>,
  cables: ReadonlyArray<C>,
  site: {
    farPortOf: (end: CableEnd) => { deviceId: string } | undefined;
    isCabled: (portId: string) => boolean;
    cableExists: (cableId: string) => boolean;
  },
): { error: string } | { cables: Array<C> } => {
  if (cables.length > MAX_PORTS_PER_DEVICE) return { error: "Too many cables" };
  const own = (end: CableEnd) => end.deviceId === deviceId;
  const laid: Array<C> = [];
  const taken = new Set<string>();
  const laidIds = new Set<string>();
  for (const cable of cables) {
    if (!isCableId(cable.id)) return { error: "Invalid cable id" };
    const ends = [cable.a, cable.b];
    if (cable.a.portId === cable.b.portId) {
      return { error: "A cable joins two ports" };
    }
    if (!ends.some(own))
      return { error: "Cable does not plug into the device" };
    if (ends.some((end) => own(end) && !ownPortIds.has(end.portId))) {
      return { error: "Cable port not found" };
    }
    const fits =
      !site.cableExists(cable.id) &&
      !laidIds.has(cable.id) &&
      ends.every(
        (end) =>
          (own(end) || site.farPortOf(end)?.deviceId === end.deviceId) &&
          !site.isCabled(end.portId) &&
          !taken.has(end.portId),
      );
    if (!fits) continue;
    for (const end of ends) taken.add(end.portId);
    laidIds.add(cable.id);
    laid.push(cable);
  }
  return { cables: laid };
};

/** A port as a trace walks it. */
export type TracePort = {
  id: string;
  deviceId: string;
  kind: PortKind;
  rearPortId?: string;
};

const MAX_TRACE_HOPS = 32;

/**
 * Where a cable from `start` leads (ADR 0022): the far port of each cable in
 * turn, crossing a patch panel from a front port to its rear port and back,
 * until a port has no cable, is an interface, or belongs to a wall socket.
 * The last port is where the trace ends; none when `start` is uncabled.
 */
export const traceFrom = async <P extends TracePort>(
  start: P,
  site: {
    /** The port at the other end of the cable plugged into `portId`. */
    cabledTo: (portId: string) => Promise<P | undefined>;
    portOf: (portId: string) => Promise<P | undefined>;
    /** The front port that passes through to a rear port. */
    frontOf: (rearPortId: string) => Promise<P | undefined>;
    isSocket: (deviceId: string) => Promise<boolean>;
  },
): Promise<Array<P>> => {
  const hops: Array<P> = [];
  // A miscabled panel may lead back where the trace has been.
  const seen = new Set<string>([start.id]);
  let at = start;
  while (hops.length < MAX_TRACE_HOPS) {
    const far = await site.cabledTo(at.id);
    if (!far || seen.has(far.id)) break;
    hops.push(far);
    seen.add(far.id);
    if (far.kind === "interface" || (await site.isSocket(far.deviceId))) {
      break;
    }
    const through =
      far.kind === "front"
        ? far.rearPortId === undefined
          ? undefined
          : await site.portOf(far.rearPortId)
        : await site.frontOf(far.id);
    if (!through || seen.has(through.id)) break;
    seen.add(through.id);
    at = through;
  }
  return hops;
};
