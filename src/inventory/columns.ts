// The inventory table's columns, their order and how each sorts.
import type { FunctionReturnType } from "convex/server";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { hasStatus } from "@/devices/status";
import type { DeviceStatus } from "@/types/map";
import type { api } from "../../convex/_generated/api";

export type InventoryRow = FunctionReturnType<
  typeof api.devices.listForSite
>[number];

/** The columns a reader may hide; the name always shows. */
export const OPTIONAL_COLUMNS = [
  { id: "type", label: "Type", width: "9rem" },
  { id: "status", label: "État", width: "8rem" },
  { id: "macs", label: "Adresses MAC", width: "10rem" },
  { id: "ip", label: "Adresse IP", width: "8rem" },
  { id: "location", label: "Emplacement", width: "15rem" },
] as const;

export type ColumnId = (typeof OPTIONAL_COLUMNS)[number]["id"];

export type SortKey = "name" | "type" | "status" | "location";
export type Sort = { key: SortKey; descending: boolean };

export const DEFAULT_SORT: Sort = { key: "name", descending: false };

// A passive device has no status (B13), so no status filter or count has it.
export const statusOf = (device: InventoryRow): DeviceStatus | null =>
  hasStatus(device.type) ? (device.metadata.status ?? "unknown") : null;

export const locationLabel = (device: InventoryRow): string | undefined =>
  device.location
    ? `${device.location.buildingName} · ${device.location.floorName}`
    : undefined;

// What needs a look first: offline, then silent, then unknown.
const STATUS_ORDER: Record<DeviceStatus, number> = {
  down: 0,
  stale: 1,
  unknown: 2,
  up: 3,
};

const statusRank = (device: InventoryRow) => {
  const status = statusOf(device);
  return status === null ? Number.MAX_SAFE_INTEGER : STATUS_ORDER[status];
};

const byText = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const compareBy: Record<
  Exclude<SortKey, "name">,
  (a: InventoryRow, b: InventoryRow) => number
> = {
  type: (a, b) =>
    byText.compare(getDeviceKindLabel(a.type), getDeviceKindLabel(b.type)),
  // Devices without a status after every other, as « — » reads.
  status: (a, b) => statusRank(a) - statusRank(b),
  // Unplaced devices after every placed one, whichever the direction.
  location: (a, b) => {
    const left = locationLabel(a);
    const right = locationLabel(b);
    if (left === right) return 0;
    if (left === undefined) return 1;
    if (right === undefined) return -1;
    return byText.compare(left, right);
  },
};

/** The rows in `sort` order, ties by name so the order never jumps. */
export const sortRows = (
  rows: ReadonlyArray<InventoryRow>,
  sort: Sort,
): Array<InventoryRow> => {
  const direction = sort.descending ? -1 : 1;
  const byName = (a: InventoryRow, b: InventoryRow) =>
    byText.compare(a.name, b.name);
  if (sort.key === "name") {
    return rows.toSorted((a, b) => direction * byName(a, b));
  }
  const compare = compareBy[sort.key];
  return rows.toSorted((a, b) => {
    // Unplaced devices, and devices without a status, stay last whichever
    // the direction.
    const missingLast =
      (sort.key === "location" && (!a.location || !b.location)) ||
      (sort.key === "status" && (statusOf(a) === null || statusOf(b) === null));
    const order = missingLast ? compare(a, b) : direction * compare(a, b);
    return order || byName(a, b);
  });
};

const HIDDEN_KEY = "netplan.inventory.hiddenColumns";

const isColumnId = (value: unknown): value is ColumnId =>
  OPTIONAL_COLUMNS.some((column) => column.id === value);

/** The columns this browser hid last time; every column shows by default. */
export const readHiddenColumns = (): Array<ColumnId> => {
  try {
    const stored: unknown = JSON.parse(
      window.localStorage.getItem(HIDDEN_KEY) ?? "[]",
    );
    return Array.isArray(stored) ? stored.filter(isColumnId) : [];
  } catch {
    return [];
  }
};

export const writeHiddenColumns = (hidden: ReadonlyArray<ColumnId>) => {
  window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
};
