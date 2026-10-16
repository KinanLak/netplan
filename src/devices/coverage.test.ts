import { describe, expect, it } from "bun:test";
import { coverageByType } from "./coverage";

const on = { floorId: "floor:a" };

describe("plan coverage", () => {
  it("counts placed devices out of all, per type the site has", () => {
    expect(
      coverageByType([
        { type: "wall-port", location: on },
        { type: "pc", location: null },
        { type: "wall-port", location: null },
        { type: "switch", location: on },
        { type: "wall-port", location: on },
      ]),
    ).toEqual([
      { type: "switch", placed: 1, total: 1 },
      { type: "pc", placed: 0, total: 1 },
      { type: "wall-port", placed: 2, total: 3 },
    ]);
  });

  it("is empty for a site without devices", () => {
    expect(coverageByType([])).toEqual([]);
  });
});
