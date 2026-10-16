// What a collection cycle makes of LibreNMS (ADRs 0022 and 0023): its ports
// matched to the inventory's by name, and the MAC addresses its forwarding
// tables put on edge ports.
import { normalizeMac } from "../devices/mac";
import { librenmsId } from "./librenms";

/** A LibreNMS port and the names a person may know it by. */
export type LibreNMSPort = { id: number; names: Array<string> };

/** A forwarding table entry: a MAC address learnt on a LibreNMS port. */
export type FdbEntry = { portId: number; mac: string };

/** A port of a polled switch, with where its cabling leads. */
export type SwitchPort = {
  id: string;
  switchId: string;
  name: string;
  /** The wall socket a trace from the port reaches, if any. */
  socketId: string | null;
  cabled: boolean;
};

/** A MAC address seen on an edge port during a cycle. */
export type Sighting = {
  mac: string;
  portId: string;
  switchId: string;
  socketId?: string;
};

/**
 * An uncabled port with more addresses than this leads to another switch or
 * an access point rather than to a desk.
 */
export const MAX_UNCABLED_EDGE_MACS = 4;

/** A device is offline after this many cycles in a row without a sighting. */
export const MISSES_OFFLINE = 2;

const listOf = (body: unknown, key: string): Array<unknown> => {
  if (typeof body !== "object" || body === null) return [];
  const value = (body as Record<string, unknown>)[key];
  // LibreNMS answers a single entry as an object rather than a list.
  if (Array.isArray(value)) return value;
  return typeof value === "object" && value !== null ? [value] : [];
};

const fieldsOf = (item: unknown): Record<string, unknown> =>
  typeof item === "object" && item !== null
    ? (item as Record<string, unknown>)
    : {};

/** The ports of a `/api/v0/devices/:id/ports` answer. */
export const readLibreNMSPorts = (body: unknown): Array<LibreNMSPort> =>
  listOf(body, "ports").flatMap((item) => {
    const fields = fieldsOf(item);
    const id = librenmsId(fields.port_id);
    if (id === null) return [];
    const names = [fields.ifName, fields.ifDescr].filter(
      (name): name is string => typeof name === "string" && name.trim() !== "",
    );
    return [{ id, names }];
  });

/** The entries of a `/api/v0/devices/:id/fdb` answer. */
export const readLibreNMSFdb = (body: unknown): Array<FdbEntry> =>
  listOf(body, "ports_fdb").flatMap((item) => {
    const fields = fieldsOf(item);
    const portId = librenmsId(fields.port_id);
    const mac =
      typeof fields.mac_address === "string"
        ? normalizeMac(fields.mac_address)
        : null;
    return portId === null || mac === null ? [] : [{ portId, mac }];
  });

/** When LibreNMS last finished discovering a device, from `/devices/:id`. */
export const readLastDiscovered = (body: unknown): string | null => {
  const value = fieldsOf(listOf(body, "devices").at(0)).last_discovered;
  return typeof value === "string" && value !== "" ? value : null;
};

const key = (name: string) => name.trim().toLowerCase();

const split = (name: string) => {
  const [, letters = "", rest = ""] = /^([a-z]*)(.*)$/s.exec(key(name)) ?? [];
  return { letters, rest };
};

/** `Gi1/0/18` and `GigabitEthernet1/0/18`: one leading word shortens the other. */
const abbreviates = (a: string, b: string) => {
  const x = split(a);
  const y = split(b);
  return (
    x.rest !== "" &&
    x.rest === y.rest &&
    x.letters !== "" &&
    y.letters !== "" &&
    (x.letters.startsWith(y.letters) || y.letters.startsWith(x.letters))
  );
};

const onlyOne = (ids: Set<string>) =>
  ids.size === 1 ? (ids.values().next().value ?? null) : null;

/**
 * The inventory port each LibreNMS port is (ADR 0023): the one named exactly
 * like it, case aside, else the one whose name differs only by an
 * abbreviated leading word. A match must be unique among the ports of the
 * switches the LibreNMS device stands for, and claimed by a single LibreNMS
 * port.
 */
export const matchPorts = (
  librenmsPorts: ReadonlyArray<LibreNMSPort>,
  inventory: ReadonlyArray<{ id: string; name: string }>,
): Map<number, string> => {
  const claims = new Map<string, Array<number>>();
  for (const port of librenmsPorts) {
    const names = new Set(port.names.map(key));
    const exact = new Set(
      inventory.filter((own) => names.has(key(own.name))).map((own) => own.id),
    );
    const found =
      exact.size > 0
        ? onlyOne(exact)
        : onlyOne(
            new Set(
              inventory
                .filter((own) =>
                  port.names.some((name) => abbreviates(name, own.name)),
                )
                .map((own) => own.id),
            ),
          );
    if (found !== null)
      claims.set(found, [...(claims.get(found) ?? []), port.id]);
  }
  const matched = new Map<number, string>();
  for (const [ownId, portIds] of claims) {
    const [only] = portIds;
    if (portIds.length === 1) matched.set(only, ownId);
  }
  return matched;
};

/**
 * The MAC addresses seen on edge ports (ADR 0022): ports whose cabling
 * reaches a wall socket, and uncabled ports with few addresses. A MAC seen
 * on several is placed at a socket when one of them has one.
 */
export const edgeSightings = (
  fdb: ReadonlyArray<FdbEntry>,
  matched: ReadonlyMap<number, string>,
  switchPorts: ReadonlyArray<SwitchPort>,
): Array<Sighting> => {
  const portsById = new Map(switchPorts.map((port) => [port.id, port]));
  const macsByPort = new Map<string, Set<string>>();
  for (const entry of fdb) {
    const portId = matched.get(entry.portId);
    if (portId === undefined) continue;
    macsByPort.set(
      portId,
      (macsByPort.get(portId) ?? new Set<string>()).add(entry.mac),
    );
  }
  const sightings = new Map<string, Sighting>();
  for (const [portId, macs] of macsByPort) {
    const port = portsById.get(portId);
    if (!port) continue;
    const edge =
      port.socketId !== null ||
      (!port.cabled && macs.size <= MAX_UNCABLED_EDGE_MACS);
    if (!edge) continue;
    for (const mac of macs) {
      if (sightings.get(mac)?.socketId !== undefined) continue;
      sightings.set(mac, {
        mac,
        portId,
        switchId: port.switchId,
        ...(port.socketId === null ? {} : { socketId: port.socketId }),
      });
    }
  }
  return [...sightings.values()];
};

/** Whether a device whose MAC addresses missed these many cycles is online. */
export const isOnline = (misses: ReadonlyArray<number>) =>
  misses.some((missed) => missed < MISSES_OFFLINE);

export type SightingCounts = {
  /** LibreNMS devices read. */
  switches: number;
  /** MAC addresses seen on edge ports. */
  seen: number;
  /** Devices that came online or went offline during the cycle. */
  online: number;
  offline: number;
  /** MAC addresses seen that no device of the site carries. */
  unknown: number;
};

const counted = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`;

/** What a LibreNMS read found, for the admin's cycle report. */
export function sightingSummary(counts: SightingCounts): string {
  const changes = [
    counts.online > 0
      ? counted(counts.online, "passé en ligne", "passés en ligne")
      : null,
    counts.offline > 0
      ? counted(counts.offline, "passé hors ligne", "passés hors ligne")
      : null,
    counts.unknown > 0
      ? counted(counts.unknown, "inconnue", "inconnues")
      : null,
  ].filter((part) => part !== null);
  const read = `${counted(counts.switches, "switch lu", "switchs lus")}, ${counted(counts.seen, "MAC vue", "MAC vues")}`;
  return changes.length > 0 ? `${read} (${changes.join(", ")}).` : `${read}.`;
}
