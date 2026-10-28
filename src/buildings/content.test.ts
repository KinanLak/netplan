import { describe, expect, it } from "bun:test";
import { describeContent, describeLabels } from "@/buildings/content";

const content = (
  devices: number,
  wallBlocks: number,
  overlays: number,
  labels = 0,
) => ({
  devices,
  wallBlocks,
  overlays,
  labels,
});

describe("describeContent", () => {
  it("counts what stands, in French, with the right plurals", () => {
    expect(describeContent(content(9, 34, 1))).toBe(
      "9 équipements, 34 blocs de mur et 1 calque",
    );
    expect(describeContent(content(1, 0, 2))).toBe("1 équipement et 2 calques");
    expect(describeContent(content(0, 0, 0))).toBe(null);
  });

  it("leaves texts out of what keeps a floor, and names them apart (4.2)", () => {
    expect(describeContent(content(0, 0, 0, 3))).toBe(null);
    expect(describeLabels(content(0, 0, 0, 3))).toBe("3 textes");
    expect(describeLabels(content(0, 0, 0, 1))).toBe("1 texte");
    expect(describeLabels(content(0, 0, 0))).toBe(null);
  });
});
