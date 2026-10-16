// The NetBox import (ADR 0022, ADR 0023): what NetBox lists, read into
// devices, and how they merge into a site's inventory. Pure, so the merge
// rules are tested without a backend; Convex bundles this file, so relative
// imports only.
import { MAX_MACS_PER_DEVICE } from "../devices/identity";
import { normalizeMac } from "../devices/mac";
import type { NetBoxRoleMapping, NetBoxRoleType } from "./netbox";

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
    const model = isObject(item.device_type)
      ? text(item.device_type.model)
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
        serial: text(item.serial),
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
};

export type ImportPlan = {
  /** NetBox devices already in the inventory, and the manual devices they merge into. */
  update: Array<{ deviceId: string; device: ImportedDevice; bind: boolean }>;
  create: Array<ImportedDevice>;
  /** A hostname alone matches: an Éditeur confirms or rejects the merge. */
  suggest: Array<{ device: ImportedDevice; candidateIds: Array<string> }>;
  /** Several candidates or a contradiction: an admin chooses. */
  conflict: Array<{ device: ImportedDevice; candidateIds: Array<string> }>;
  /** Devices NetBox no longer lists: unplaced ones go, placed ones stay as manual. */
  remove: Array<string>;
  unbind: Array<string>;
  /** The MAC addresses each written device ends with. */
  macs: Map<string, Array<string>>;
};

// Serials vendors ship when the real one was never written.
const PLACEHOLDER_SERIALS = new Set([
  "0",
  "00000000",
  "0123456789",
  "123456789",
  "1234567890",
  "chassis serial number",
  "default string",
  "n/a",
  "na",
  "none",
  "not applicable",
  "not specified",
  "system serial number",
  "to be filled by o.e.m.",
  "unknown",
]);

const serialKey = (serial: string | undefined): string | undefined => {
  const key = serial?.trim().toLowerCase();
  return key && !PLACEHOLDER_SERIALS.has(key) ? key : undefined;
};

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
 * otherwise.
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
    remove: [],
    unbind: [],
    macs: new Map(),
  };
  const bound = new Map(
    inventory.flatMap((device) =>
      device.netboxId ? [[device.netboxId, device] as const] : [],
    ),
  );
  const manual = inventory.filter((device) => device.netboxId === undefined);

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
    const candidates = manual.filter(
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
    const named = manual.filter(
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

  const listed = new Set(imported.map((device) => device.externalId));
  for (const [externalId, device] of bound) {
    if (listed.has(externalId)) continue;
    (device.placed ? plan.unbind : plan.remove).push(device.id);
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
  const removed = new Set(plan.remove);
  const kept = new Set<string>();
  for (const device of inventory) {
    if (written.has(device.id) || removed.has(device.id)) continue;
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

/** The key of a created device in `ImportPlan.macs`, before it has an id. */
export const newDeviceKey = (device: ImportedDevice) =>
  `netbox:${device.externalId}`;

export type ImportCounts = {
  imported: number;
  created: number;
  merged: number;
  removed: number;
  review: number;
};

const counted = (count: number, one: string, many: string) =>
  `${count} ${count > 1 ? many : one}`;

/** What an import did, for the admin's cycle report. */
export function importSummary(counts: ImportCounts): string {
  const changes = [
    counts.created > 0 ? counted(counts.created, "nouveau", "nouveaux") : null,
    counts.merged > 0 ? counted(counts.merged, "rattaché", "rattachés") : null,
    counts.removed > 0 ? counted(counts.removed, "retiré", "retirés") : null,
    counts.review > 0 ? `${counts.review} à vérifier` : null,
  ].filter((part) => part !== null);
  const imported = `Import : ${counted(counts.imported, "équipement", "équipements")}`;
  return changes.length > 0
    ? `${imported} (${changes.join(", ")}).`
    : `${imported}.`;
}
