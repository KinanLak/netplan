import { describe, expect, it } from "bun:test";
import { isCanonicalMac, normalizeMac, parseMacList } from "./mac";

describe("normalizeMac", () => {
  it("reads the notations tools print", () => {
    for (const text of [
      "AA:BB:CC:DD:EE:FF",
      "aa-bb-cc-dd-ee-ff",
      "aabb.ccdd.eeff",
      " AABBCCDDEEFF ",
    ]) {
      expect(normalizeMac(text)).toBe("aa:bb:cc:dd:ee:ff");
    }
  });

  it("rejects what is not a MAC address", () => {
    for (const text of [
      "",
      "aa:bb:cc:dd:ee",
      "aa:bb:cc:dd:ee:ff:00",
      "gg:bb:cc:dd:ee:ff",
    ]) {
      expect(normalizeMac(text)).toBeNull();
    }
  });
});

describe("isCanonicalMac", () => {
  it("accepts only the lowercase colon form", () => {
    expect(isCanonicalMac("aa:bb:cc:dd:ee:ff")).toBe(true);
    expect(isCanonicalMac("AA:BB:CC:DD:EE:FF")).toBe(false);
    expect(isCanonicalMac("aabbccddeeff")).toBe(false);
  });
});

describe("parseMacList", () => {
  it("reads one address per line or comma, once each", () => {
    expect(
      parseMacList("AA-BB-CC-DD-EE-FF\n\n aabb.ccdd.ee00, aa:bb:cc:dd:ee:ff"),
    ).toEqual({ macs: ["aa:bb:cc:dd:ee:ff", "aa:bb:cc:dd:ee:00"] });
    expect(parseMacList("  ")).toEqual({ macs: [] });
  });

  it("names the first entry it cannot read", () => {
    expect(parseMacList("aa:bb:cc:dd:ee:ff\n12:34")).toEqual({
      unreadable: "12:34",
    });
  });
});
