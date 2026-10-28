// What a collection cycle makes of LibreNMS (ADRs 0022, 0023 and 0025): its
// ports matched to the inventory's by name, or naming a manual switch's, and
// the MAC addresses its forwarding tables put on edge ports.
import { normalizeMac } from "../devices/mac";
import {
  MAX_PORTS_PER_DEVICE,
  PORT_NAME_MAX_LENGTH,
  portIdOf,
} from "../devices/ports";
import type { DeviceId, PortKind } from "../types/map";
import { librenmsId } from "./librenms";

/**
 * A LibreNMS port, the names a person may know it by, and its link when
 * LibreNMS knows it.
 */
export type LibreNMSPort = {
  id: number;
  names: Array<string>;
  link?: "up" | "down";
  /** Its interface index, when it is a physical Ethernet port. */
  ethernetIndex?: number;
};

/**
 * A forwarding table entry: a MAC address learnt on a LibreNMS port, and
 * when LibreNMS last refreshed it, in its own clock.
 */
export type FdbEntry = {
  portId: number;
  mac: string;
  updatedAt: number | null;
};

/** A port of a polled switch, with where its cabling leads. */
export type SwitchPort = {
  id: string;
  switchId: string;
  name: string;
  /** The wall socket a trace from the port reaches, if any. */
  socketId: string | null;
  /** The device a trace from the port ends at, if cabled. */
  endId: string | null;
  cabled: boolean;
};

/**
 * The MACs a read saw on a port where they tell whether a device is behind it
 * (ADR 0025): an edge port, where any device of the site counts, or a port
 * cabled to a device, which counts only when it carries one of them.
 */
export type PortPresence = {
  portId: string;
  macs: Array<string>;
  deviceId?: string;
};

/** A MAC address seen on an edge port during a cycle. */
export type Sighting = {
  mac: string;
  portId: string;
  switchId: string;
  socketId?: string;
};

/**
 * A MAC address seen behind a wall socket during a cycle, and when LibreNMS
 * last refreshed that entry, absent when the table is undated. A MAC may be
 * seen behind several.
 */
export type SocketSighting = {
  mac: string;
  socketId: string;
  updatedAt?: number;
};

/**
 * An uncabled port with more addresses than this leads to another switch or
 * an access point rather than to a desk.
 */
export const MAX_UNCABLED_EDGE_MACS = 4;

/** A device is offline after this many cycles in a row without a sighting. */
export const MISSES_OFFLINE = 2;

/**
 * One discovery refreshes a switch's whole table within seconds, and Netplan
 * asks for one every five minutes: an entry this much older than the newest
 * was left behind by an earlier discovery. LibreNMS keeps such entries for a
 * while, so their presence proves nothing.
 */
export const FDB_FRESH_MS = 2 * 60_000;

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

/**
 * A port's link from its IF-MIB operational status; `testing` and `unknown`
 * say nothing about it.
 */
const LINKS = new Map<string, "up" | "down">([
  ["up", "up"],
  ["down", "down"],
  ["lowerLayerDown", "down"],
  ["dormant", "down"],
  ["notPresent", "down"],
]);

/**
 * The IF-MIB types of a physical Ethernet port; VLAN interfaces, aggregates
 * and loopbacks have others.
 */
const ETHERNET = new Set([
  "ethernetCsmacd",
  "fastEther",
  "fastEtherFX",
  "gigabitEthernet",
]);

/** The ports of a `/api/v0/devices/:id/ports` answer. */
export const readLibreNMSPorts = (body: unknown): Array<LibreNMSPort> =>
  listOf(body, "ports").flatMap((item) => {
    const fields = fieldsOf(item);
    const id = librenmsId(fields.port_id);
    if (id === null) return [];
    const names = [fields.ifName, fields.ifDescr].filter(
      (name): name is string => typeof name === "string" && name.trim() !== "",
    );
    const link = LINKS.get(String(fields.ifOperStatus));
    const index = librenmsId(fields.ifIndex);
    const ethernet = ETHERNET.has(String(fields.ifType)) && index !== null;
    return [
      {
        id,
        names,
        ...(link && { link }),
        ...(ethernet && { ethernetIndex: index }),
      },
    ];
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
    const updatedAt = readLibreNMSTime(fields.updated_at);
    return portId === null || mac === null ? [] : [{ portId, mac, updatedAt }];
  });

/**
 * A LibreNMS timestamp as milliseconds. One without a zone, such as
 * `2019-01-1 01:01:01`, is in LibreNMS's own zone and read as UTC, so it
 * compares only with others from the same answer.
 */
export function readLibreNMSTime(value: unknown): number | null {
  if (typeof value !== "string") return null;
  if (/(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    const at = Date.parse(value);
    return Number.isNaN(at) ? null : at;
  }
  const parts =
    /^(\d{4})-(\d{1,2})-(\d{1,2})[ t](\d{1,2}):(\d{2}):(\d{2})/i.exec(
      value.trim(),
    );
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

/**
 * What a cycle keeps of a switch's table, in LibreNMS's clock: its newest
 * entry, and up to when a discovery proved its entries stale.
 */
export type FdbTable = { newest: number; staleUpTo?: number };

/** A table's newest entry, or `null` when none has a timestamp. */
export const newestFdbEntry = (
  entries: ReadonlyArray<FdbEntry>,
): number | null =>
  entries.reduce<number | null>(
    (newest, { updatedAt }) =>
      updatedAt === null || (newest !== null && newest >= updatedAt)
        ? newest
        : updatedAt,
    null,
  );

/**
 * The entries of one switch's table that its latest discovery refreshed, and
 * what the next read compares with. A discovery that finished without moving
 * the newest entry refreshed nothing: every entry up to it stays unseen, in
 * this read and the later ones, until a discovery brings newer ones. A table
 * without timestamps cannot be judged and is kept whole. The comparison stays
 * within the table's own clock, which may differ from the one LibreNMS dates
 * discoveries with.
 */
export function freshFdb(
  entries: ReadonlyArray<FdbEntry>,
  previous: FdbTable | undefined,
  discovered: boolean,
): { fresh: Array<FdbEntry>; table: FdbTable | null } {
  const newest = newestFdbEntry(entries);
  if (newest === null) return { fresh: [...entries], table: null };
  const staleUpTo =
    discovered && previous?.newest === newest ? newest : previous?.staleUpTo;
  const fresh = entries.filter(
    ({ updatedAt }) =>
      updatedAt !== null &&
      updatedAt >= newest - FDB_FRESH_MS &&
      (staleUpTo === undefined || updatedAt > staleUpTo),
  );
  return {
    fresh,
    table: { newest, ...(staleUpTo !== undefined && { staleUpTo }) },
  };
}

/**
 * Whether LibreNMS reaches a device, from `/devices/:id`: its `status` is 1
 * while the device answers its polls and 0 once it does not.
 */
export const readLibreNMSDeviceStatus = (
  body: unknown,
): "up" | "down" | null => {
  const value = fieldsOf(listOf(body, "devices").at(0)).status;
  if (value === 1 || value === true || value === "1") return "up";
  if (value === 0 || value === false || value === "0") return "down";
  return null;
};

/**
 * How long a switch's read vouches for the statuses resting on it
 * (ADRs 0025 and 0038): two of the site's intervals and a cycle's lease, so
 * that one late or failed cycle changes nothing; 25 minutes by default.
 */
export const readStaleAfterMs = (intervalMinutes: number, leaseMs: number) =>
  2 * intervalMinutes * 60_000 + leaseMs;

/** A switch's last successful read, and whether its statuses were removed. */
export type SwitchRead = { switchId: string; readAt: number; expired?: true };

/** The switches whose read still vouches for their statuses. */
export const freshSwitches = (
  reads: ReadonlyArray<SwitchRead>,
  now: number,
  staleAfterMs: number,
): Set<string> =>
  new Set(
    reads
      .filter((read) => !read.expired && now - read.readAt <= staleAfterMs)
      .map((read) => read.switchId),
  );

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
 * LibreNMS's physical Ethernet ports' names, by interface index; an unnamed
 * one is empty, so it still holds its position.
 */
export const ethernetNames = (
  librenmsPorts: ReadonlyArray<LibreNMSPort>,
): Array<string> =>
  librenmsPorts
    .flatMap(({ names, ethernetIndex }) =>
      ethernetIndex === undefined
        ? []
        : [
            {
              index: ethernetIndex,
              name: names.length > 0 ? names[0].trim() : "",
            },
          ],
    )
    .sort((a, b) => a.index - b.index)
    .map(({ name }) => name);

/** A switch's port, as adopting LibreNMS's names sees it. */
export type OwnPort = {
  id: string;
  name: string;
  kind: PortKind;
  order: number;
  cabled: boolean;
  /** Whether a source such as NetBox provides it. */
  sourced: boolean;
};

export type PortAdoption = {
  rename: Array<{ id: string; name: string }>;
  add: Array<{ id: string; name: string; order: number }>;
  remove: Array<string>;
};

/**
 * How a switch takes LibreNMS's port names (ADR 0025). While its ports are
 * still the "1" to "n" a manual switch starts with, the port at each
 * position takes the name of LibreNMS's Ethernet port there, so its id, and
 * its cable, stay. Ports LibreNMS has beyond are added; uncabled ones beyond
 * LibreNMS's are removed, cabled ones kept. `null` once a person or a source
 * has named the ports, or when LibreNMS's names would not make a valid list.
 */
export const adoptedPorts = (
  switchId: string,
  own: ReadonlyArray<OwnPort>,
  names: ReadonlyArray<string>,
): PortAdoption | null => {
  const ordered = [...own].sort((a, b) => a.order - b.order);
  const isDefault =
    ordered.length > 0 &&
    ordered.every(
      (port, i) =>
        port.kind === "interface" &&
        !port.sourced &&
        port.order === i + 1 &&
        port.name === String(i + 1),
    );
  if (!isDefault || names.length === 0) return null;
  if (names.length > MAX_PORTS_PER_DEVICE) return null;
  if (names.some((name) => !name || name.length > PORT_NAME_MAX_LENGTH)) {
    return null;
  }
  // Name matching needs each name once.
  if (new Set(names.map(key)).size !== names.length) return null;

  const rename = ordered.slice(0, names.length).flatMap((port, i) => {
    const name = names[i] ?? port.name;
    return name === port.name ? [] : [{ id: port.id, name }];
  });
  const taken = new Set(own.map(({ id }) => id));
  const add: PortAdoption["add"] = [];
  let n = ordered.length;
  for (const [i, name] of names.entries()) {
    if (i < ordered.length) continue;
    let id: string;
    do {
      n += 1;
      id = portIdOf(switchId as DeviceId, "interface", n);
    } while (taken.has(id));
    taken.add(id);
    add.push({ id, name, order: i + 1 });
  }
  const remove = ordered
    .slice(names.length)
    .filter(({ cabled }) => !cabled)
    .map(({ id }) => id);
  return { rename, add, remove };
};

/**
 * The MACs on each matched port, each with when LibreNMS last refreshed it
 * there, `null` when it did not say.
 */
const macsByPort = (
  fdb: ReadonlyArray<FdbEntry>,
  matched: ReadonlyMap<number, string>,
) => {
  const macs = new Map<string, Map<string, number | null>>();
  for (const entry of fdb) {
    const portId = matched.get(entry.portId);
    if (portId === undefined) continue;
    const onPort = macs.get(portId) ?? new Map<string, number | null>();
    const known = onPort.get(entry.mac) ?? null;
    onPort.set(
      entry.mac,
      known === null || (entry.updatedAt ?? 0) > known
        ? (entry.updatedAt ?? known)
        : known,
    );
    macs.set(portId, onPort);
  }
  return macs;
};

/** A port whose cabling reaches a wall socket, or uncabled with few MACs. */
const isEdge = (port: SwitchPort, macs: ReadonlyMap<string, unknown>) =>
  port.socketId !== null ||
  (!port.cabled && macs.size <= MAX_UNCABLED_EDGE_MACS);

/** The edge ports the MACs were seen on, each MAC with its refresh time. */
const edgePorts = (
  fdb: ReadonlyArray<FdbEntry>,
  matched: ReadonlyMap<number, string>,
  switchPorts: ReadonlyArray<SwitchPort>,
) => {
  const portsById = new Map(switchPorts.map((port) => [port.id, port]));
  return [...macsByPort(fdb, matched)].flatMap(([portId, macs]) => {
    const port = portsById.get(portId);
    return port && isEdge(port, macs) ? [{ port, macs }] : [];
  });
};

/**
 * The MAC addresses seen on edge ports (ADR 0022). A MAC seen on several is
 * placed at a socket when one of them has one, the one LibreNMS refreshed
 * last when several do.
 */
export const edgeSightings = (
  fdb: ReadonlyArray<FdbEntry>,
  matched: ReadonlyMap<number, string>,
  switchPorts: ReadonlyArray<SwitchPort>,
): Array<Sighting> => {
  const sightings = new Map<
    string,
    { sighting: Sighting; updatedAt: number | null }
  >();
  for (const { port, macs } of edgePorts(fdb, matched, switchPorts)) {
    for (const [mac, updatedAt] of macs) {
      const known = sightings.get(mac);
      const atSocket = port.socketId !== null;
      if (known) {
        const knownAtSocket = known.sighting.socketId !== undefined;
        const newer =
          updatedAt !== null &&
          (known.updatedAt === null || updatedAt > known.updatedAt);
        if (knownAtSocket && (!atSocket || !newer)) continue;
        if (!knownAtSocket && !atSocket) continue;
      }
      sightings.set(mac, {
        sighting: {
          mac,
          portId: port.id,
          switchId: port.switchId,
          ...(port.socketId === null ? {} : { socketId: port.socketId }),
        },
        updatedAt,
      });
    }
  }
  return [...sightings.values()].map(({ sighting }) => sighting);
};

/** Every socket each MAC was seen behind, with when (`SocketSighting`). */
export const socketSightings = (
  fdb: ReadonlyArray<FdbEntry>,
  matched: ReadonlyMap<number, string>,
  switchPorts: ReadonlyArray<SwitchPort>,
): Array<SocketSighting> =>
  edgePorts(fdb, matched, switchPorts).flatMap(({ port, macs }) => {
    const { socketId } = port;
    if (socketId === null) return [];
    return [...macs].map(([mac, updatedAt]) => ({
      mac,
      socketId,
      ...(updatedAt !== null && { updatedAt }),
    }));
  });

/** Where a read may have seen a device behind a port (`PortPresence`). */
export const portPresence = (
  fdb: ReadonlyArray<FdbEntry>,
  matched: ReadonlyMap<number, string>,
  switchPorts: ReadonlyArray<SwitchPort>,
): Array<PortPresence> => {
  const portsById = new Map(switchPorts.map((port) => [port.id, port]));
  return [...macsByPort(fdb, matched)].flatMap(([portId, macs]) => {
    const port = portsById.get(portId);
    if (!port) return [];
    if (isEdge(port, macs)) return [{ portId, macs: [...macs.keys()] }];
    if (port.endId === null) return [];
    return [{ portId, macs: [...macs.keys()], deviceId: port.endId }];
  });
};

/** Whether a device whose MAC addresses missed these many cycles is online. */
export const isOnline = (misses: ReadonlyArray<number>) =>
  misses.some((missed) => missed < MISSES_OFFLINE);

/**
 * What each device's latest sighting saw, across all of its MACs so that one
 * seen through another interface still counts: `pick` of every row with the
 * newest `seenAt`. Only the devices `wanted` are looked up.
 */
function latestSeen<Row extends { ownerId?: string; seenAt: number }, Value>(
  history: ReadonlyArray<Row>,
  wanted: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  pick: (row: Row) => Value,
): Map<string, Set<Value>> {
  const latest = new Map<string, { seenAt: number; values: Set<Value> }>();
  for (const row of history) {
    const { ownerId, seenAt } = row;
    if (ownerId === undefined || !wanted.has(ownerId)) continue;
    const last = latest.get(ownerId);
    if (!last || seenAt > last.seenAt) {
      latest.set(ownerId, { seenAt, values: new Set([pick(row)]) });
    } else if (seenAt === last.seenAt) last.values.add(pick(row));
  }
  return new Map([...latest].map(([id, { values }]) => [id, values]));
}

/**
 * The socket among several whose entry LibreNMS refreshed clearly last: more
 * than one cycle's spread of discoveries after every other (ADR 0038). None
 * when two are about as recent, or one is undated.
 */
export function clearlyNewest(
  sockets: ReadonlyMap<string, number | null>,
): string | null {
  const dated: Array<[string, number]> = [];
  for (const [socket, at] of sockets) {
    if (at === null) return sockets.size === 1 ? socket : null;
    dated.push([socket, at]);
  }
  if (dated.length === 0) return null;
  const [first, ...others] = dated.toSorted(([, a], [, b]) => b - a);
  return others.every(([, at]) => first[1] - at > FDB_FRESH_MS)
    ? first[0]
    : null;
}

/**
 * Where a sighting row says its device's place follows: the socket it saw
 * the MAC at, unless the cycle decided otherwise (`decided`).
 */
export const placeSocketOf = (row: {
  socketId?: string;
  decided?: { socketId?: string };
}): string | undefined => (row.decided ? row.decided.socketId : row.socketId);

/**
 * Where each device seen at a socket goes (ADR 0038): `moves`, the socket to
 * place it next to; `kept`, the socket its place already follows; `held`,
 * the devices left where they are because their new sockets are about as
 * recent.
 *
 * A device seen at a socket its place follows stays, and one on no floor
 * goes there; a device the network sees for the first time keeps a place a
 * person gave it. Otherwise a device goes to the one new socket it is seen
 * at, or to the one LibreNMS refreshed clearly last; when several are about
 * as recent it is held, and a later cycle decides.
 */
export function socketMoves(
  sightings: ReadonlyArray<SocketSighting>,
  ownerOf: ReadonlyMap<string, { id: string; placed: boolean }>,
  history: ReadonlyArray<{
    ownerId?: string;
    socketId?: string;
    decided?: { socketId?: string };
    seenAt: number;
  }>,
): {
  moves: Map<string, string>;
  kept: Map<string, string>;
  held: Set<string>;
} {
  const current = new Map<
    string,
    { placed: boolean; sockets: Map<string, number | null> }
  >();
  for (const { mac, socketId, updatedAt = null } of sightings) {
    const owner = ownerOf.get(mac);
    if (!owner) continue;
    const seen = current.get(owner.id) ?? {
      placed: owner.placed,
      sockets: new Map<string, number | null>(),
    };
    const known = seen.sockets.get(socketId);
    seen.sockets.set(
      socketId,
      known === undefined
        ? updatedAt
        : known === null || updatedAt === null
          ? null
          : Math.max(known, updatedAt),
    );
    current.set(owner.id, seen);
  }
  const latest = latestSeen(history, current, placeSocketOf);
  const moves = new Map<string, string>();
  const kept = new Map<string, string>();
  const held = new Set<string>();
  for (const [id, { placed, sockets }] of current) {
    const last = latest.get(id);
    const known = [...sockets.keys()].find((socket) => last?.has(socket));
    if (known !== undefined) {
      (placed ? kept : moves).set(id, known);
      continue;
    }
    if (placed && last === undefined) continue;
    const target = clearlyNewest(sockets);
    if (target === null) held.add(id);
    else moves.set(id, target);
  }
  return { moves, kept, held };
}

/**
 * Where each device the history records as located now (ADR 0027): the first
 * sighting this read made of it, when its MACs were never seen before, or
 * when none of the ports they are seen on now is one its latest sighting saw.
 * `first` says no sighting of it was known: its arrival may have recorded
 * that place already.
 */
export function portMoves<Seen extends { mac: string; portId: string }>(
  sightings: ReadonlyArray<Seen>,
  ownerOf: ReadonlyMap<string, { id: string }>,
  history: ReadonlyArray<{ ownerId?: string; portId: string; seenAt: number }>,
): Map<string, { seen: Seen; first: boolean }> {
  const current = new Map<string, Array<Seen>>();
  for (const sighting of sightings) {
    const owner = ownerOf.get(sighting.mac);
    if (!owner) continue;
    current.set(owner.id, [...(current.get(owner.id) ?? []), sighting]);
  }
  const latest = latestSeen(history, current, ({ portId }) => portId);
  const moves = new Map<string, { seen: Seen; first: boolean }>();
  for (const [id, seen] of current) {
    const last = latest.get(id);
    // Every entry of `current` holds at least one sighting.
    if (!seen.some(({ portId }) => last?.has(portId))) {
      moves.set(id, { seen: seen[0], first: last === undefined });
    }
  }
  return moves;
}

export type SightingCounts = {
  /** LibreNMS devices read. */
  switches: number;
  /** LibreNMS devices asked; the summary says « 1 switch lu sur 2 ». */
  polled?: number;
  /** MAC addresses seen on edge ports. */
  seen: number;
  /** Devices that came online or went offline during the cycle. */
  online: number;
  offline: number;
  /** Devices placed next to the socket they were seen at. */
  placed: number;
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
    counts.placed > 0
      ? counted(
          counts.placed,
          "placé près de sa prise",
          "placés près de leur prise",
        )
      : null,
    counts.unknown > 0
      ? counted(counts.unknown, "inconnue", "inconnues")
      : null,
  ].filter((part) => part !== null);
  const switches =
    counts.polled !== undefined && counts.polled !== counts.switches
      ? `${counts.switches} ${counts.switches > 1 ? "switchs lus" : "switch lu"} sur ${counts.polled}`
      : counted(counts.switches, "switch lu", "switchs lus");
  const read = `${switches}, ${counted(counts.seen, "MAC vue", "MAC vues")}`;
  return changes.length > 0 ? `${read} (${changes.join(", ")}).` : `${read}.`;
}
