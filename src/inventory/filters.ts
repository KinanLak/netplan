// The inventory's filters, kept in the URL so a reload, a link or Back
// brings the same list (A62), and counted in the context of one another.
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { isAbsentFromSource } from "@/devices/identity";
import { matchesDeviceSearch } from "@/devices/search";
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import { DEFAULT_SORT, locationLabel, statusOf } from "@/inventory/columns";
import type { InventoryRow, Sort, SortKey } from "@/inventory/columns";
import type { DeviceStatus, DeviceType } from "@/types/map";

export type Placement = "all" | "placed" | "unplaced";

export type InventoryFilters = {
  query: string;
  placement: Placement;
  status: "all" | DeviceStatus;
  type: "all" | DeviceType;
  /** Only the devices NetBox no longer returns (ADR 0034). */
  absent: boolean;
};

/** No filter at all. */
export const NO_FILTERS: InventoryFilters = {
  query: "",
  placement: "all",
  status: "all",
  type: "all",
  absent: false,
};

/** What the URL holds; a default value is left out. */
export type InventorySearch = {
  q?: string;
  placement?: Exclude<Placement, "all">;
  status?: DeviceStatus;
  type?: DeviceType;
  absent?: true;
  sort?: Exclude<SortKey, "name">;
  desc?: true;
};

const SORT_KEYS: ReadonlyArray<string> = ["type", "status", "location"];

const isStatus = (value: unknown): value is DeviceStatus =>
  typeof value === "string" && Object.hasOwn(DEVICE_STATUS_LABELS, value);

/**
 * Reads the inventory's part of the URL. Every key is written, `undefined`
 * when invalid: the router merges the root route's raw query under this
 * one, so a key left out would leak in. A type is kept as written: one the
 * site no longer has filters nothing (see the inventory page).
 */
export const parseInventorySearch = (
  search: Record<string, unknown>,
): InventorySearch => ({
  q: typeof search.q === "string" && search.q !== "" ? search.q : undefined,
  placement:
    search.placement === "placed" || search.placement === "unplaced"
      ? search.placement
      : undefined,
  status: isStatus(search.status) ? search.status : undefined,
  type:
    typeof search.type === "string" && search.type !== ""
      ? (search.type as DeviceType)
      : undefined,
  absent: search.absent === true || search.absent === "true" ? true : undefined,
  sort:
    typeof search.sort === "string" && SORT_KEYS.includes(search.sort)
      ? (search.sort as Exclude<SortKey, "name">)
      : undefined,
  desc: search.desc === true || search.desc === "true" ? true : undefined,
});

export const filtersOf = (search: InventorySearch): InventoryFilters => ({
  query: search.q ?? "",
  placement: search.placement ?? "all",
  status: search.status ?? "all",
  type: search.type ?? "all",
  absent: search.absent === true,
});

export const sortOf = (search: InventorySearch): Sort =>
  search.sort
    ? { key: search.sort, descending: search.desc === true }
    : { ...DEFAULT_SORT, descending: search.desc === true };

/** The URL for these filters and this order, defaults left out. */
export const toSearch = (
  filters: InventoryFilters,
  sort: Sort,
): InventorySearch => ({
  ...(filters.query !== "" && { q: filters.query }),
  ...(filters.placement !== "all" && { placement: filters.placement }),
  ...(filters.status !== "all" && { status: filters.status }),
  ...(filters.type !== "all" && { type: filters.type }),
  ...(filters.absent && { absent: true as const }),
  ...(sort.key !== "name" && { sort: sort.key }),
  ...(sort.descending && { desc: true as const }),
});

export const isFiltered = (filters: InventoryFilters): boolean =>
  filters.query.trim() !== "" ||
  filters.placement !== "all" ||
  filters.status !== "all" ||
  filters.type !== "all" ||
  filters.absent;

type Facet = "query" | "placement" | "status" | "type" | "absent";

const passes = (
  device: InventoryRow,
  filters: InventoryFilters,
  except?: Facet,
): boolean =>
  (except === "placement" ||
    filters.placement === "all" ||
    (filters.placement === "placed") === Boolean(device.location)) &&
  (except === "status" ||
    filters.status === "all" ||
    statusOf(device) === filters.status) &&
  (except === "type" ||
    filters.type === "all" ||
    device.type === filters.type) &&
  (except === "absent" ||
    !filters.absent ||
    isAbsentFromSource(device.source)) &&
  (except === "query" ||
    matchesDeviceSearch(device, filters.query, [
      getDeviceKindLabel(device.type),
      locationLabel(device),
    ]));

export const applyFilters = (
  rows: ReadonlyArray<InventoryRow>,
  filters: InventoryFilters,
): Array<InventoryRow> => rows.filter((device) => passes(device, filters));

/**
 * How many rows each choice of a filter would show, the other filters
 * applied, so a count never promises rows that are not there.
 */
export const facetCounts = (
  rows: ReadonlyArray<InventoryRow>,
  filters: InventoryFilters,
): {
  placement: Record<Placement, number>;
  status: Record<"all" | DeviceStatus, number>;
  /** Devices NetBox no longer returns, the other filters applied. */
  absent: number;
} => {
  const byPlacement = rows.filter((device) =>
    passes(device, filters, "placement"),
  );
  const byStatus = rows.filter((device) => passes(device, filters, "status"));
  const statuses = Object.keys(DEVICE_STATUS_LABELS) as Array<DeviceStatus>;
  return {
    absent: rows.filter(
      (device) =>
        passes(device, filters, "absent") && isAbsentFromSource(device.source),
    ).length,
    placement: {
      all: byPlacement.length,
      placed: byPlacement.filter((device) => device.location).length,
      unplaced: byPlacement.filter((device) => !device.location).length,
    },
    status: Object.fromEntries([
      ["all", byStatus.length],
      ...statuses.map((status) => [
        status,
        byStatus.filter((device) => statusOf(device) === status).length,
      ]),
    ]) as Record<"all" | DeviceStatus, number>,
  };
};
