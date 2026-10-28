// The NetBox import (ADR 0022, ADR 0023): what NetBox lists, read into
// devices, and how they merge into a site's inventory. Pure, so the merge
// rules are tested without a backend; Convex bundles this file, so relative
// imports only.
import { MAX_MACS_PER_DEVICE } from "../devices/identity";
import { normalizeMac } from "../devices/mac";
import { meaningful } from "../devices/placeholders";
import { MAX_PORTS_PER_DEVICE, PORT_NAME_MAX_LENGTH } from "../devices/ports";
import type { PortKind } from "../types/map";
import type {
  NetBoxRoleMapping,
  NetBoxRoleType,
  NetBoxSettings,
} from "./netbox";

/** A device as NetBox describes it, in the fields NetBox owns. */
export type ImportedDevice = {
  /** The NetBox device id. */
  externalId: string;
  url?: string;
  type: NetBoxRoleType;
  name: string;
  serial?: string;
  macs: Array<string>;
  model?: string;
  ip?: string;
};

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;

const idOf = (value: unknown): number | undefined =>
  isObject(value) && typeof value.id === "number" ? value.id : undefined;

/** The MAC addresses of an interface, whichever NetBox version wrote it. */
const interfaceMacs = (item: Raw): Array<string> => {
  const found: Array<unknown> = [item.mac_address];
  if (isObject(item.primary_mac_address)) {
    found.push(item.primary_mac_address.mac_address);
  }
  if (Array.isArray(item.mac_addresses)) {
    for (const entry of item.mac_addresses) {
      if (isObject(entry)) found.push(entry.mac_address);
    }
  }
  return found.flatMap((value) => {
    const mac = typeof value === "string" ? normalizeMac(value) : null;
    return mac ? [mac] : [];
  });
};

/**
 * The devices of the mapped roles, with the MAC addresses of their
 * interfaces. Devices of other roles, and objects NetBox did not describe as
 * expected, are left out.
 */
export function readNetBoxDevices(
  devices: ReadonlyArray<Raw>,
  interfaces: ReadonlyArray<Raw>,
  roles: ReadonlyArray<NetBoxRoleMapping>,
): Array<ImportedDevice> {
  const typeOfRole = new Map(roles.map((role) => [role.id, role.type]));
  const macsOf = new Map<number, Set<string>>();
  for (const item of interfaces) {
    const deviceId = idOf(item.device);
    if (deviceId === undefined) continue;
    const macs = macsOf.get(deviceId) ?? new Set();
    for (const mac of interfaceMacs(item)) macs.add(mac);
    macsOf.set(deviceId, macs);
  }

  return devices.flatMap((item): Array<ImportedDevice> => {
    const id = typeof item.id === "number" ? item.id : undefined;
    const roleId = idOf(item.role) ?? idOf(item.device_role);
    const type = roleId === undefined ? undefined : typeOfRole.get(roleId);
    if (id === undefined || !type) return [];
    // NetBox device types named "undefined" stand for no model at all.
    const model = isObject(item.device_type)
      ? meaningful(text(item.device_type.model))
      : undefined;
    const address = isObject(item.primary_ip)
      ? text(item.primary_ip.address)
      : undefined;
    return [
      {
        externalId: String(id),
        url: text(item.display_url),
        type,
        // NetBox lets a device go unnamed.
        name: text(item.name) ?? `${model ?? "Équipement"} #${id}`,
        serial: meaningful(text(item.serial)),
        macs: [...(macsOf.get(id) ?? [])].sort(),
        model,
        // NetBox writes the prefix length after the address.
        ip: address?.split("/")[0],
      },
    ];
  });
}

/** A device of the site as the merge sees it. */
export type InventoryDevice = {
  id: string;
  /** Its NetBox device; `undefined` for a manual device, `null` for one from another source. */
  netboxId?: string | null;
  name: string;
  hostname?: string;
  serial?: string;
  macs: ReadonlyArray<string>;
  placed: boolean;
  /** Since when NetBox no longer returns it (ADR 0034). */
  missingSince?: number;
};

export type ImportPlan = {
  /** NetBox devices already in the inventory, and the manual devices they merge into. */
  update: Array<{ deviceId: string; device: ImportedDevice; bind: boolean }>;
  create: Array<ImportedDevice>;
  /** A hostname alone matches: an Éditeur confirms or rejects the merge. */
  suggest: Array<{ device: ImportedDevice; candidateIds: Array<string> }>;
  /** Several candidates or a contradiction: an admin chooses. */
  conflict: Array<{ device: ImportedDevice; candidateIds: Array<string> }>;
  /**
   * Devices NetBox stopped returning with this import; they keep their
   * binding, absent since now (ADR 0034).
   */
  missing: Array<string>;
  /** The MAC addresses each written device ends with. */
  macs: Map<string, Array<string>>;
};

const serialKey = (serial: string | undefined): string | undefined =>
  meaningful(serial)?.trim().toLowerCase();

/** A name or hostname without its domain, to compare one with the other. */
const hostKey = (name: string | undefined): string | undefined =>
  name?.trim().toLowerCase().split(".")[0] || undefined;

const countOf = (keys: Iterable<string | undefined>) => {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

/**
 * How a NetBox import changes a site's inventory (ADR 0022). A device NetBox
 * already brought is updated; a new one merges into the one manual device
 * that shares its MAC or serial without contradicting it, waits for review
 * when only a hostname matches or the match is ambiguous, and is created
 * otherwise. A device NetBox no longer returns is never removed here: it
 * becomes absent (ADR 0034).
 */
export function planNetBoxImport(
  imported: ReadonlyArray<ImportedDevice>,
  inventory: ReadonlyArray<InventoryDevice>,
): ImportPlan {
  const plan: ImportPlan = {
    update: [],
    create: [],
    suggest: [],
    conflict: [],
    missing: [],
    macs: new Map(),
  };
  const bound = new Map(
    inventory.flatMap((device) =>
      device.netboxId ? [[device.netboxId, device] as const] : [],
    ),
  );
  const listed = new Set(imported.map((device) => device.externalId));
  // A device NetBox no longer returns links again to the device NetBox
  // returns in its place, by the same rules as a manual one (ADR 0034).
  const free = inventory.filter(
    (device) =>
      device.netboxId === undefined ||
      (device.netboxId !== null && !listed.has(device.netboxId)),
  );

  // An identifier several imported devices share identifies none of them.
  const serialCounts = countOf(
    imported.map((device) => serialKey(device.serial)),
  );
  const macCounts = countOf(imported.flatMap((device) => device.macs));
  const serialOf = (device: ImportedDevice) => {
    const key = serialKey(device.serial);
    return key && serialCounts.get(key) === 1 ? key : undefined;
  };
  const macsOf = (device: ImportedDevice) =>
    device.macs.filter((mac) => macCounts.get(mac) === 1);

  const binds = new Map<string, Array<ImportedDevice>>();
  for (const device of imported) {
    const known = bound.get(device.externalId);
    if (known) {
      plan.update.push({ deviceId: known.id, device, bind: false });
      continue;
    }
    const serial = serialOf(device);
    const macs = macsOf(device);
    const candidates = free.filter(
      (other) =>
        (serial !== undefined && serialKey(other.serial) === serial) ||
        macs.some((mac) => other.macs.includes(mac)),
    );
    const [only] = candidates;
    if (candidates.length === 1 && !contradicts(serial, macs, only)) {
      binds.set(only.id, [...(binds.get(only.id) ?? []), device]);
      continue;
    }
    if (candidates.length > 0) {
      plan.conflict.push({ device, candidateIds: candidates.map((c) => c.id) });
      continue;
    }
    const host = hostKey(device.name);
    const named = free.filter(
      (other) =>
        host !== undefined &&
        (hostKey(other.hostname) === host || hostKey(other.name) === host),
    );
    if (named.length === 1) {
      plan.suggest.push({ device, candidateIds: named.map((c) => c.id) });
    } else if (named.length > 1) {
      plan.conflict.push({ device, candidateIds: named.map((c) => c.id) });
    } else {
      plan.create.push(device);
    }
  }
  for (const [deviceId, devices] of binds) {
    const [device] = devices;
    if (devices.length === 1) {
      plan.update.push({ deviceId, device, bind: true });
    } else {
      // Two NetBox devices claim one manual device.
      for (const each of devices) {
        plan.conflict.push({ device: each, candidateIds: [deviceId] });
      }
    }
  }

  const relinked = new Set(plan.update.map((entry) => entry.deviceId));
  for (const [externalId, device] of bound) {
    if (listed.has(externalId) || relinked.has(device.id)) continue;
    if (device.missingSince === undefined) plan.missing.push(device.id);
  }

  plan.macs = assignMacs(plan, inventory, macsOf);
  return plan;
}

const contradicts = (
  serial: string | undefined,
  macs: ReadonlyArray<string>,
  candidate: InventoryDevice,
) => {
  const theirs = serialKey(candidate.serial);
  if (serial && theirs && serial !== theirs) return true;
  return (
    macs.length > 0 &&
    candidate.macs.length > 0 &&
    !macs.some((mac) => candidate.macs.includes(mac))
  );
};

/**
 * The MAC addresses of every device the import writes. A MAC address belongs
 * to one device of a site: one that a device outside the import keeps stays
 * with it, and one the import moves goes to its new device.
 */
function assignMacs(
  plan: ImportPlan,
  inventory: ReadonlyArray<InventoryDevice>,
  macsOf: (device: ImportedDevice) => Array<string>,
): Map<string, Array<string>> {
  const written = new Set(plan.update.map((entry) => entry.deviceId));
  const kept = new Set<string>();
  for (const device of inventory) {
    if (written.has(device.id)) continue;
    for (const mac of device.macs) kept.add(mac);
  }
  const macs = new Map<string, Array<string>>();
  const pick = (deviceId: string, device: ImportedDevice) =>
    macs.set(
      deviceId,
      macsOf(device)
        .filter((mac) => !kept.has(mac))
        .slice(0, MAX_MACS_PER_DEVICE),
    );
  for (const { deviceId, device } of plan.update) pick(deviceId, device);
  for (const device of plan.create) pick(newDeviceKey(device), device);
  return macs;
}

/** How long a device absent from NetBox and on no floor is kept (ADR 0034). */
export const ABSENCE_KEPT_MS = 30 * 24 * 60 * 60_000;

/**
 * Whether the purge deletes an absent device. The 30 days are measured up to
 * the site's last NetBox import rather than to now, so an absence NetBox has
 * not confirmed, because its imports stopped or fail, is never purged.
 */
export const absencePurgeDue = (
  device: { placed: boolean; missingSince?: number },
  importedAt: number | undefined,
) =>
  !device.placed &&
  device.missingSince !== undefined &&
  importedAt !== undefined &&
  importedAt - device.missingSince >= ABSENCE_KEPT_MS;

/** The key of a created device in `ImportPlan.macs`, before it has an id. */
export const newDeviceKey = (device: ImportedDevice) =>
  `netbox:${device.externalId}`;

export type ImportCounts = {
  imported: number;
  created: number;
  merged: number;
  /** Devices that became absent from NetBox with this import. */
  missing: number;
  /** Absent devices NetBox returns again. */
  returned: number;
  review: number;
};

const counted = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`;

/** What an import did, for the admin's cycle report. */
export function importSummary(counts: ImportCounts): string {
  const changes = [
    counts.created > 0 ? counted(counts.created, "nouveau", "nouveaux") : null,
    counts.merged > 0 ? counted(counts.merged, "rattaché", "rattachés") : null,
    counts.missing > 0
      ? counted(counts.missing, "absent de NetBox", "absents de NetBox")
      : null,
    counts.returned > 0 ? `${counts.returned} de retour` : null,
    counts.review > 0 ? `${counts.review} à vérifier` : null,
  ].filter((part) => part !== null);
  const imported = `Import : ${counted(counts.imported, "équipement", "équipements")}`;
  return changes.length > 0
    ? `${imported} (${changes.join(", ")}).`
    : `${imported}.`;
}

/**
 * Whether two settings import the same thing: the same NetBox site, and the
 * same roles as the same types. Names are NetBox's labels and do not count.
 */
export const sameImport = (a: NetBoxSettings, b: NetBoxSettings) => {
  const roles = (settings: NetBoxSettings) =>
    settings.roles
      .map((role) => `${role.id}:${role.type}`)
      .toSorted()
      .join(",");
  return a.site?.id === b.site?.id && roles(a) === roles(b);
};

/** A port of an imported device; its external id names its NetBox kind. */
export type ImportedPort = {
  deviceExternalId: string;
  externalId: string;
  kind: PortKind;
  name: string;
  /** For a front port, the rear port it passes through to. */
  rearExternalId?: string;
};

export type ImportedCable = { externalId: string; a: string; b: string };

const PORT_TYPES: Record<string, string | undefined> = {
  "dcim.interface": "interface",
  "dcim.frontport": "front-port",
  "dcim.rearport": "rear-port",
};

const portExternalId = (prefix: string, id: unknown) =>
  typeof id === "number" ? `${prefix}:${id}` : undefined;

/** The rear port a front port maps to, before and after NetBox 4.5. */
const rearOf = (item: Raw): string | undefined => {
  if (Array.isArray(item.rear_ports)) {
    const [first] = item.rear_ports as Array<unknown>;
    return isObject(first)
      ? portExternalId("rear-port", first.rear_port)
      : undefined;
  }
  return portExternalId("rear-port", idOf(item.rear_port));
};

// Interfaces no cable plugs into: a VLAN or a loopback, a Linux bridge, an
// aggregate of other ports.
const NOT_A_PORT = new Set(["virtual", "bridge", "lag"]);

// The names systems give their virtual interfaces, for the NetBox that types
// them as copper ports: a hypervisor's bridges (vmbr0, vmbr0v12), bonds,
// tunnels, containers' pairs, aggregates and sub-interfaces (Gi1/0/1.100).
const VIRTUAL_NAMES: ReadonlyArray<RegExp> = [
  /^(vmbr|virbr|bond|team|veth|tap|tun|docker|vlan|vxlan|wg)\d/i,
  /^br-?\d/i,
  /^(port-channel|po)\s*\d/i,
  /^lo\d*$/i,
  /\.\d+$/,
];

/** Whether a NetBox interface is something a cable plugs into. */
export const isPhysicalInterface = (item: Raw): boolean => {
  const type = isObject(item.type) ? text(item.type.value) : undefined;
  if (type !== undefined && NOT_A_PORT.has(type)) return false;
  const name = text(item.name) ?? "";
  return !VIRTUAL_NAMES.some((pattern) => pattern.test(name));
};

/**
 * The ports of the imported devices, interfaces first, and the cables that
 * join two of them end to end. A cable with several terminations at one end
 * (a breakout) has no place in Netplan's one-cable-per-port model and is left
 * out, as is a second cable on a port. Virtual, bridge and aggregate
 * interfaces are no ports: their MAC addresses still identify the device.
 */
export function readNetBoxCabling(
  devices: ReadonlyArray<ImportedDevice>,
  lists: {
    interfaces: ReadonlyArray<Raw>;
    frontPorts: ReadonlyArray<Raw>;
    rearPorts: ReadonlyArray<Raw>;
    cables: ReadonlyArray<Raw>;
  },
): { ports: Array<ImportedPort>; cables: Array<ImportedCable> } {
  const imported = new Set(devices.map((device) => device.externalId));
  const ports: Array<ImportedPort> = [];
  const perDevice = new Map<string, number>();
  const read = (
    items: ReadonlyArray<Raw>,
    prefix: string,
    kind: PortKind,
    rear?: (item: Raw) => string | undefined,
  ) => {
    for (const item of items) {
      const deviceId = idOf(item.device);
      const externalId = portExternalId(prefix, item.id);
      const name = text(item.name);
      if (deviceId === undefined || !externalId || !name) continue;
      const deviceExternalId = String(deviceId);
      const count = perDevice.get(deviceExternalId) ?? 0;
      if (!imported.has(deviceExternalId) || count >= MAX_PORTS_PER_DEVICE) {
        continue;
      }
      perDevice.set(deviceExternalId, count + 1);
      ports.push({
        deviceExternalId,
        externalId,
        kind,
        name: name.slice(0, PORT_NAME_MAX_LENGTH),
        rearExternalId: rear?.(item),
      });
    }
  };
  read(lists.interfaces.filter(isPhysicalInterface), "interface", "interface");
  read(lists.rearPorts, "rear-port", "rear");
  read(lists.frontPorts, "front-port", "front", rearOf);

  const known = new Set(ports.map((port) => port.externalId));
  const end = (terminations: unknown): string | undefined => {
    if (!Array.isArray(terminations) || terminations.length !== 1) return;
    const [only] = terminations as Array<unknown>;
    if (!isObject(only) || typeof only.object_type !== "string") return;
    const prefix = PORT_TYPES[only.object_type];
    const id = prefix && portExternalId(prefix, only.object_id);
    return id && known.has(id) ? id : undefined;
  };
  const cabled = new Set<string>();
  const cables = lists.cables.flatMap((item): Array<ImportedCable> => {
    const a = end(item.a_terminations);
    const b = end(item.b_terminations);
    if (typeof item.id !== "number" || !a || !b || a === b) return [];
    if (cabled.has(a) || cabled.has(b)) return [];
    cabled.add(a);
    cabled.add(b);
    return [{ externalId: String(item.id), a, b }];
  });
  return { ports, cables };
}

/** A port a device already has, as the reconciliation sees it. */
export type ExistingPort = {
  id: string;
  name: string;
  kind: PortKind;
  /** Its NetBox port, `null` for a manual port. */
  netboxId: string | null;
};

/**
 * How a device's ports become NetBox's: a port keeps its id when it already
 * came from that NetBox port or, when it is manual or its NetBox port is
 * gone, when its kind and name match, so the cables plugged into it stay.
 * Other ports go with their cables.
 */
export function planDevicePorts(
  deviceId: string,
  existing: ReadonlyArray<ExistingPort>,
  wanted: ReadonlyArray<ImportedPort>,
): {
  ports: Array<{ id: string; port: ImportedPort; order: number }>;
  remove: Array<string>;
} {
  const bySource = new Map(
    existing.flatMap((port) =>
      port.netboxId ? [[port.netboxId, port.id] as const] : [],
    ),
  );
  const nameKey = (kind: PortKind, name: string) =>
    `${kind}:${name.trim().toLowerCase()}`;
  // A manual port, or one whose NetBox port NetBox no longer lists, as when
  // an absent device comes back recreated (ADR 0034), keeps its id by name.
  const listed = new Set(wanted.map((port) => port.externalId));
  const manual = new Map<string, string>();
  for (const port of existing) {
    const key = nameKey(port.kind, port.name);
    const free = port.netboxId === null || !listed.has(port.netboxId);
    if (free && !manual.has(key)) manual.set(key, port.id);
  }
  const used = new Set<string>();
  const matched = wanted.map((port) => {
    const id =
      bySource.get(port.externalId) ??
      manual.get(nameKey(port.kind, port.name));
    if (!id || used.has(id)) return null;
    used.add(id);
    return id;
  });
  // A released port keeps its generated id, so a new port's id may already
  // be taken by a port that stays or that is about to go with its cable.
  const taken = new Set(existing.map((port) => port.id));
  const ports = wanted.map((port, index) => {
    let id = matched[index];
    if (!id) {
      const base = `port:${deviceId}:nb:${port.externalId}`;
      id = base;
      for (let n = 2; taken.has(id) || used.has(id); n += 1)
        id = `${base}:${n}`;
      used.add(id);
    }
    // Netplan numbers its own ports from 1.
    return { id, port, order: index + 1 };
  });
  return {
    ports,
    remove: existing.map((port) => port.id).filter((id) => !used.has(id)),
  };
}
