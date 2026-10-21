import { describe, expect, it } from "bun:test";
import { fitLabel, middleEllipsis, socketLabel } from "./nodeLabel";

const box = { width: 68, lines: 2, max: 10, min: 7 };

describe("fitLabel", () => {
  it("keeps a short name at full size, in capitals", () => {
    expect(fitLabel("Poste 3", box)).toEqual({ text: "POSTE 3", fontSize: 10 });
  });

  it("shrinks a long name until it fits, breaking at hyphens", () => {
    const fitted = fitLabel("pc-demo-poste-reunion", box);
    expect(fitted.text).toBe("PC-DEMO-POSTE-REUNION");
    expect(fitted.fontSize).toBeLessThan(10);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(7);
  });

  it("never goes under the floor, and keeps the name's end", () => {
    const fitted = fitLabel("HP-COLOR-LASERJET-PRO-MFP-M479FDW-ACCUEIL", box);
    expect(fitted.fontSize).toBe(7);
    expect(fitted.text).toContain("…");
    expect(fitted.text.endsWith("ACCUEIL")).toBe(true);
  });
});

describe("middleEllipsis", () => {
  it("leaves a text that fits alone", () => {
    expect(middleEllipsis("B-06", 10)).toBe("B-06");
    expect(middleEllipsis("ABCDEFGHIJ", 7)).toBe("ABC…HIJ");
  });
});

describe("socketLabel", () => {
  it("drops a leading « Prise », which the icon already says", () => {
    expect(socketLabel("Prise B-06")).toBe("B-06");
    expect(socketLabel("prise: C-01")).toBe("C-01");
    expect(socketLabel("Prise")).toBe("Prise");
    expect(socketLabel("Imprimante")).toBe("Imprimante");
  });
});
