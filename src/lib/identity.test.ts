import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { colorForHue, loadOrCreateIdentity } from "./identity";

const STORAGE_KEY = "netplan-identity";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("identity", () => {
  it("creates and persists a fresh identity on first call", () => {
    const identity = loadOrCreateIdentity();

    expect(identity.sessionId.length > 0).toBe(true);
    expect(identity.displayName.includes(" ")).toBe(true);
    expect(identity.colorHue).toBeGreaterThanOrEqual(0);
    expect(identity.colorHue).toBeLessThan(360);

    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBe(null);
    expect(JSON.parse(stored as string)).toEqual(identity);
  });

  it("returns the persisted identity on subsequent calls", () => {
    const first = loadOrCreateIdentity();
    const second = loadOrCreateIdentity();
    expect(second).toEqual(first);
  });

  it("recovers from a corrupted storage entry", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not-json");
    const identity = loadOrCreateIdentity();
    expect(identity.sessionId.length > 0).toBe(true);
  });

  it("derives stable color roles from a hue", () => {
    expect(colorForHue(180, "fill")).toContain("hsl(180");
    expect(colorForHue(180, "stroke")).toContain("hsl(180");
    expect(colorForHue(180, "label")).toContain("hsl(180");
  });
});
