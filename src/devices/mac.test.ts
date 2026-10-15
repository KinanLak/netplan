import { describe, expect, it } from "bun:test";
import { isCanonicalMac, normalizeMac } from "./mac";

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
