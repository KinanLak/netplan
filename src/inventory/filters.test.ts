import { describe, expect, it } from "bun:test";
import { sortRows } from "./columns";
import type { InventoryRow } from "./columns";
import {
  applyFilters,
  facetCounts,
  filtersOf,
  parseInventorySearch,
  sortOf,
  toSearch,
} from "./filters";

const row = (name: string, more: Partial<InventoryRow> = {}): InventoryRow => ({
  id: name,
  type: "pc",
  name,
  hostname: undefined,
  serial: undefined,
  macs: [],
  model: undefined,
  ip: undefined,
  notes: undefined,
  source: undefined,
  metadata: {},
  location: null,
  ...more,
});

const placed = {
  floorId: "floor-1",
  buildingId: "building-a",
  buildingName: "Bâtiment A",
  floorName: "Étage 1",
};

const rows = [
  row("Poste 2", { metadata: { status: "down" }, location: placed }),
  row("Poste 10", { metadata: { status: "up" }, location: placed }),
  row("Imprimante", { type: "endpoint", metadata: { status: "down" } }),
  row("Poste 1", { metadata: { status: "unknown" } }),
];

describe("inventory URL", () => {
  it("reads what it can and drops the rest", () => {
    expect(
      parseInventorySearch({
        q: "poste",
        placement: "nowhere",
        status: "down",
        sort: "status",
        desc: "true",
        site: "site:demo",
      }),
    ).toEqual({ q: "poste", status: "down", sort: "status", desc: true });
  });

  it("writes defaults as nothing, so a plain list has a plain URL", () => {
    const search = parseInventorySearch({});
    expect(toSearch(filtersOf(search), sortOf(search))).toEqual({});
    expect(
      toSearch(
        { query: "", placement: "unplaced", status: "all", type: "pc" },
        { key: "name", descending: true },
      ),
    ).toEqual({ placement: "unplaced", type: "pc", desc: true });
  });
});

describe("filters", () => {
  it("combines every filter with the search, type and place included", () => {
    const filters = {
      query: "etage 1",
      placement: "all" as const,
      status: "down" as const,
      type: "all" as const,
    };
    expect(applyFilters(rows, filters).map((device) => device.name)).toEqual([
      "Poste 2",
    ]);
  });

  it("counts each choice with the other filters applied", () => {
    const counts = facetCounts(rows, {
      query: "",
      placement: "unplaced",
      status: "down",
      type: "all",
    });
    // Two devices are down, one of them unplaced; two are unplaced, one down.
    expect(counts.status).toEqual({
      all: 2,
      up: 0,
      down: 1,
      stale: 0,
      unknown: 1,
    });
    expect(counts.placement).toEqual({ all: 2, placed: 1, unplaced: 1 });
  });
});

describe("sortRows", () => {
  const names = (sorted: Array<InventoryRow>) =>
    sorted.map((device) => device.name);

  it("sorts names as people count, either way", () => {
    expect(names(sortRows(rows, { key: "name", descending: false }))).toEqual([
      "Imprimante",
      "Poste 1",
      "Poste 2",
      "Poste 10",
    ]);
    expect(names(sortRows(rows, { key: "name", descending: true }))[0]).toBe(
      "Poste 10",
    );
  });

  it("puts offline devices first, ties by name", () => {
    expect(names(sortRows(rows, { key: "status", descending: false }))).toEqual(
      ["Imprimante", "Poste 2", "Poste 1", "Poste 10"],
    );
  });

  it("keeps unplaced devices last whichever the direction", () => {
    for (const descending of [false, true]) {
      const sorted = names(sortRows(rows, { key: "location", descending }));
      expect(sorted.slice(2)).toEqual(["Imprimante", "Poste 1"]);
    }
  });
});
