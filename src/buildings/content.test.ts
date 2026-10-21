import { describe, expect, it } from "bun:test";
import { describeContent } from "@/buildings/content";

describe("describeContent", () => {
  it("counts what stands, in French, with the right plurals", () => {
    expect(describeContent({ devices: 9, wallBlocks: 34, overlays: 1 })).toBe(
      "9 équipements, 34 blocs de mur et 1 calque",
    );
    expect(describeContent({ devices: 1, wallBlocks: 0, overlays: 2 })).toBe(
      "1 équipement et 2 calques",
    );
    expect(describeContent({ devices: 0, wallBlocks: 0, overlays: 0 })).toBe(
      null,
    );
  });
});
