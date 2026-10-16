// Drawing a cable on the map (ADR 0025): from a free port of a device to
// another device of the same floor, through the same mutation as the port
// table.
import { comparePorts } from "@/devices/ports";
import { portLabel } from "@/devices/portState";
import type {
  Cable,
  CableDraft,
  Device,
  DeviceId,
  Port,
  PortId,
} from "@/types/map";

/** The devices a cable is drawn from or to on the map. */
export const CABLED_ON_MAP: ReadonlySet<Device["type"]> = new Set([
  "switch",
  "patch-panel",
  "wall-port",
]);

/** Where a cable being drawn was dropped: a device, or one of its ports. */
export type CableDrop = { deviceId: DeviceId; portId?: PortId };

export type CableDropResult =
  | { kind: "connect"; port: Port }
  | { kind: "pick"; ports: Array<Port> }
  | { kind: "refused"; reason: string }
  | { kind: "none" };

type FloorPorts = {
  devices: ReadonlyArray<Pick<Device, "id" | "type" | "name">>;
  ports: ReadonlyArray<Port>;
  cables: ReadonlyArray<Cable>;
};

const cabledPortIds = (cables: ReadonlyArray<Cable>) =>
  new Set(cables.flatMap(({ a, b }) => [a.portId, b.portId]));

/** A device's ports no cable is plugged into, in display order. */
export const freePortsOf = (
  deviceId: DeviceId,
  { ports, cables }: Pick<FloorPorts, "ports" | "cables">,
): Array<Port> => {
  const cabled = cabledPortIds(cables);
  return ports
    .filter((port) => port.deviceId === deviceId && !cabled.has(port.id))
    .sort(comparePorts);
};

/**
 * Why a cable cannot start at `portId`, or `null` when it can: the port
 * must belong to a device cabled on the map and be free.
 */
export const cableStartRefusal = (
  draft: CableDraft,
  floor: FloorPorts,
): string | null => {
  const device = floor.devices.find(({ id }) => id === draft.deviceId);
  const port = floor.ports.find(({ id }) => id === draft.portId);
  if (!device || !CABLED_ON_MAP.has(device.type) || !port) {
    return "Ce port ne se câble pas sur le plan.";
  }
  if (cabledPortIds(floor.cables).has(port.id)) {
    return `« ${device.name} » ${portLabel(port)} est déjà câblé : débranchez-le d'abord dans la table des ports.`;
  }
  return null;
};

/**
 * What dropping a cable on `drop` does: on a free port, cable it; on a
 * device with one free port, cable that one; with several, let the person
 * pick. Dropping back on the starting device, or on nothing, does nothing.
 */
export const cableDropResult = (
  draft: CableDraft,
  drop: CableDrop | null,
  floor: FloorPorts,
): CableDropResult => {
  if (!drop || drop.deviceId === draft.deviceId) return { kind: "none" };
  const device = floor.devices.find(({ id }) => id === drop.deviceId);
  if (!device || !CABLED_ON_MAP.has(device.type)) return { kind: "none" };

  const free = freePortsOf(device.id, floor);
  if (drop.portId !== undefined) {
    const port = free.find(({ id }) => id === drop.portId);
    if (port) return { kind: "connect", port };
    const cabled = floor.ports.find(({ id }) => id === drop.portId);
    const name = cabled ? portLabel(cabled) : drop.portId;
    return {
      kind: "refused",
      reason: `« ${device.name} » ${name} est déjà câblé.`,
    };
  }
  if (free.length === 0) {
    return {
      kind: "refused",
      reason: `« ${device.name} » n'a plus de port libre.`,
    };
  }
  return free.length === 1
    ? { kind: "connect", port: free[0] }
    : { kind: "pick", ports: free };
};
