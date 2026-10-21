// The inventory's filters, kept in the URL so a reload, a link or Back
// brings the same list (A62), and counted in the context of one another.
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
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
};

/** What the URL holds; a default value is left out. */
export type InventorySearch = {
  q?: string;
  placement?: Exclude<Placement, "all">;
  status?: DeviceStatus;
  type?: DeviceType;
  sort?: Exclude<SortKey, "name">;
  desc?: true;
};

const SORT_KEYS: ReadonlyArray<string> = ["type", "status", "location"];

const isStatus = (value: unknown): value is DeviceStatus =>
  typeof value === "string" && Object.hasOwn(DEVICE_STATUS_LABELS, value);

/**
 * Reads the inventory's part of the URL. A type is kept as written: one the
 * site no longer has filters nothing (see `effectiveFilters`).
 */
export const parseInventorySearch = (
  search: Record<string, unknown>,
): InventorySearch => ({
  ...(typeof search.q === "string" && search.q !== "" && { q: search.q }),
  ...((search.placement === "placed" || search.placement === "unplaced") && {
    placement: search.placement,
  }),
  ...(isStatus(search.status) && { status: search.status }),
  ...(typeof search.type === "string" &&
    search.type !== "" && { type: search.type as DeviceType }),
  ...(typeof search.sort === "string" &&
    SORT_KEYS.includes(search.sort) && {
      sort: search.sort as Exclude<SortKey, "name">,
    }),
  ...((search.desc === true || search.desc === "true") && {
    desc: true as const,
  }),
});

export const filtersOf = (search: InventorySearch): InventoryFilters => ({
  query: search.q ?? "",
  placement: search.placement ?? "all",
  status: search.status ?? "all",
  type: search.type ?? "all",
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
  ...(sort.key !== "name" && { sort: sort.key }),
  ...(sort.descending && { desc: true as const }),
});

export const isFiltered = (filters: InventoryFilters): boolean =>
  filters.query.trim() !== "" ||
  filters.placement !== "all" ||
  filters.status !== "all" ||
  filters.type !== "all";

type Facet = "query" | "placement" | "status" | "type";

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
} => {
  const byPlacement = rows.filter((device) =>
    passes(device, filters, "placement"),
  );
  const byStatus = rows.filter((device) => passes(device, filters, "status"));
  const statuses = Object.keys(DEVICE_STATUS_LABELS) as Array<DeviceStatus>;
  return {
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
