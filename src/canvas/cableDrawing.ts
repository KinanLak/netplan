// Drawing a cable on the map (ADR 0025): from a free port of a device to
// another device of the same floor, through the same mutations as the port
// table. A cabled port unplugs its cable instead.
import { comparePorts } from "@/devices/ports";
import { endLabel, portLabel } from "@/devices/portState";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import type {
  Cable,
  CableDraft,
  Device,
  DeviceType,
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
  | { kind: "pick"; ports: Array<Port>; deviceType: DeviceType }
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

/** What pressing a port of the map does. */
export type CableStart =
  | { kind: "draw" }
  | { kind: "unplug"; cable: Cable; label: string }
  | { kind: "refused"; reason: string };

/**
 * What pressing `draft`'s port does: a free port draws a cable from it; a
 * port cabled by hand to a device of the floor offers to unplug the cable.
 * A cable an integration made, or one to another floor, stays with the port
 * table, as does every port of a device not cabled on the map.
 */
export const cableStart = (
  draft: CableDraft,
  floor: FloorPorts,
): CableStart => {
  const device = floor.devices.find(({ id }) => id === draft.deviceId);
  const port = floor.ports.find(({ id }) => id === draft.portId);
  if (!device || !CABLED_ON_MAP.has(device.type) || !port) {
    return { kind: "refused", reason: "Ce port ne se câble pas sur le plan." };
  }
  const cable = floor.cables.find(
    ({ a, b }) => a.portId === port.id || b.portId === port.id,
  );
  if (!cable) return { kind: "draw" };

  const near = endLabel(device.name, port, device.type);
  if (cable.source) {
    return {
      kind: "refused",
      reason: `Le câble de ${near} vient de ${INTEGRATION_LABELS[cable.source.integration]} : il ne se débranche pas dans NetPlan.`,
    };
  }
  const far = cable.a.portId === port.id ? cable.b : cable.a;
  const farDevice = floor.devices.find(({ id }) => id === far.deviceId);
  const farPort = floor.ports.find(({ id }) => id === far.portId);
  if (!farDevice || !farPort) {
    return {
      kind: "refused",
      reason: `${near} est câblé vers un autre étage : débranchez-le dans la table des ports.`,
    };
  }
  return {
    kind: "unplug",
    cable,
    label: `${near} ↔ ${endLabel(farDevice.name, farPort, farDevice.type)}`,
  };
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
    const name = cabled ? portLabel(cabled, device.type) : drop.portId;
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
    : { kind: "pick", ports: free, deviceType: device.type };
};
