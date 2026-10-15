import { describe, expect, it } from "bun:test";
import type { FloorId, FloorOverlay, OverlayFileId } from "@/types/map";
import {
  formatDecimal,
  overlayWidthMetres,
  parseDecimal,
  scaleForWidthMetres,
} from "./units";

const overlay: FloorOverlay = {
  floorId: "floor:a" as FloorId,
  fileId: "overlay-file:a" as OverlayFileId,
  imageWidth: 4000,
  imageHeight: 3000,
  center: { x: 0, y: 0 },
  scale: 0.75,
  rotation: 0,
  opacity: 0.6,
  locked: false,
};

describe("parseDecimal", () => {
  it("reads a decimal comma or point", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 12.5 ")).toBe(12.5);
    expect(parseDecimal("-3")).toBe(-3);
    expect(parseDecimal(",5")).toBe(0.5);
  });

  it("refuses what is not a single number", () => {
    for (const text of ["", " ", "abc", "1,2,3", "12 m", "1e3", "Infinity"]) {
      expect(parseDecimal(text)).toBeNull();
    }
  });
});

describe("formatDecimal", () => {
  it("writes French decimals, two at most", () => {
    expect(formatDecimal(12.5)).toBe("12,5");
    expect(formatDecimal(1 / 3)).toBe("0,33");
    expect(formatDecimal(1234)).toBe("1234");
  });
});

describe("calque width in metres", () => {
  it("converts at 100 plan units per metre, both ways", () => {
    expect(overlayWidthMetres(overlay)).toBe(30);
    expect(scaleForWidthMetres(overlay, 40)).toBe(1);
  });

  it("refuses a width the scale bounds cannot reach", () => {
    expect(scaleForWidthMetres(overlay, 0)).toBeNull();
    expect(scaleForWidthMetres(overlay, -5)).toBeNull();
    expect(scaleForWidthMetres(overlay, 1e9)).toBeNull();
  });
});
