import type { DeviceType, Port, PortKind } from "@/types/map";

/** What the network last observed on a port, strongest first (ADR 0025). */
export type PortState = "seen" | "up" | "down" | "unknown";

export const PORT_STATE_LABELS: Record<PortState, string> = {
  seen: "Équipement vu",
  up: "Lien actif",
  down: "Lien inactif",
  unknown: "Inconnu",
};

/**
 * A port's colour on the map and in the drawer, and in their legends. An
 * unused port is normal, so an inactive link is quiet rather than red.
 */
export const PORT_STATE_CLASSES: Record<PortState, string> = {
  seen: "bg-up",
  up: "border border-up bg-up-background",
  down: "border border-unknown bg-unknown-background",
  unknown: "bg-unknown",
};

const KIND_LABELS: Record<PortKind, string | null> = {
  interface: null,
  front: "Avant",
  rear: "Arrière",
};

/**
 * A port as a person reads it: a patch panel's says which side it is on.
 * Other devices' ports need no side, even when a source models them as rear
 * ports, as NetBox does a switch's; without the device's type, the side is
 * always said.
 */
export const portLabel = (
  port: Pick<Port, "name" | "kind">,
  deviceType?: DeviceType,
): string => {
  const kind = KIND_LABELS[port.kind];
  if (!kind || (deviceType && deviceType !== "patch-panel")) return port.name;
  return `${kind} ${port.name}`;
};

/** One end of a cable as a toast or a menu names it. */
export const endLabel = (
  deviceName: string,
  port: Pick<Port, "name" | "kind">,
  deviceType?: DeviceType,
): string => `« ${deviceName} » ${portLabel(port, deviceType)}`;

// Cisco's abbreviations, which every network technician reads.
const INTERFACE_ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/^TenGigabitEthernet\s*(?=\d)/i, "Te"],
  [/^TwentyFiveGigE\s*(?=\d)/i, "Twe"],
  [/^FortyGigabitEthernet\s*(?=\d)/i, "Fo"],
  [/^HundredGigE\s*(?=\d)/i, "Hu"],
  [/^GigabitEthernet\s*(?=\d)/i, "Gi"],
  [/^FastEthernet\s*(?=\d)/i, "Fa"],
  [/^Ethernet\s*(?=\d)/i, "Eth"],
  [/^Port-channel\s*(?=\d)/i, "Po"],
];

/** An interface name in its short form: `GigabitEthernet1/0/1` is `Gi1/0/1`. */
export const shortPortName = (name: string): string => {
  for (const [long, short] of INTERFACE_ABBREVIATIONS) {
    if (long.test(name)) return name.replace(long, short);
  }
  return name;
};

export const portState = (port: Pick<Port, "status" | "seen">): PortState => {
  if (port.seen) return "seen";
  if (port.status === "up" || port.status === "down") return port.status;
  return "unknown";
};

/**
 * The ports a device shows, in display order: all of them, whatever their
 * kind, except the rear ports a front port passes through to, which would
 * show the same socket twice.
 */
export const shownPorts = (ports: ReadonlyArray<Port>): Array<Port> => {
  const behindFront = new Set(
    ports.flatMap((port) => (port.rearPortId ? [port.rearPortId] : [])),
  );
  return ports.filter((port) => !behindFront.has(port.id));
};

/** How many columns lay out `count` ports: two rows up to 48, then 24 wide. */
export const portColumns = (count: number): number =>
  Math.max(1, count <= 48 ? Math.ceil(count / 2) : 24);
