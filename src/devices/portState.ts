import type { Port, PortKind } from "@/types/map";

/** What the network last observed on a port, strongest first (ADR 0025). */
export type PortState = "seen" | "up" | "down" | "unknown";

export const PORT_STATE_LABELS: Record<PortState, string> = {
  seen: "Appareil vu",
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

/** A port as a person reads it: a patch panel's says which side it is on. */
export const portLabel = (port: Pick<Port, "name" | "kind">): string => {
  const kind = KIND_LABELS[port.kind];
  return kind ? `${kind} ${port.name}` : port.name;
};

/** One end of a cable as a toast or a menu names it. */
export const endLabel = (
  deviceName: string,
  port: Pick<Port, "name" | "kind">,
): string => `« ${deviceName} » ${portLabel(port)}`;

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
