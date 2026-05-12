import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { LocalIdentity } from "./identity";
import {
  colorForHue,
  createObjectId,
  createOperationMeta,
  loadOrCreateIdentity,
} from "./identity";

const STORAGE_KEY = "netplan-identity";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("identity", () => {
  it("creates and persists a fresh identity with durable counters", () => {
    const identity = loadOrCreateIdentity();

    expect(identity.clientId.startsWith("client:")).toBe(true);
    expect(identity.sessionId.startsWith("session:")).toBe(true);
    expect(identity.nextObjectCounter).toBe(0);
    expect(identity.nextOperationCounter).toBe(0);
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
    expect(identity.clientId.startsWith("client:")).toBe(true);
  });

  it("recovers from an old identity without durable counters", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionId: "old-session",
        displayName: "Old Fox",
        colorHue: 10,
      }),
    );

    const identity = loadOrCreateIdentity();
    expect(identity.clientId.startsWith("client:")).toBe(true);
    expect(identity.nextObjectCounter).toBe(0);
    expect(identity.nextOperationCounter).toBe(0);
  });

  it("generates stable unique object ids and persists the counter", () => {
    const identity = loadOrCreateIdentity();

    const first = createObjectId("device", identity);
    const second = createObjectId("device", identity);

    expect(first).toBe(`device:${identity.clientId}:0`);
    expect(second).toBe(`device:${identity.clientId}:1`);
    expect(first).not.toBe(second);
    expect(loadOrCreateIdentity().nextObjectCounter).toBe(2);
  });

  it("generates operation ids that include client identity", () => {
    const identity = loadOrCreateIdentity();

    const first = createOperationMeta(identity);
    const second = createOperationMeta(identity);

    expect(first.opId).toBe(`op:${identity.clientId}:0`);
    expect(second.opId).toBe(`op:${identity.clientId}:1`);
    expect(first.clientId).toBe(identity.clientId);
    expect(second.clientSeq).toBe(1);
    expect(loadOrCreateIdentity().nextOperationCounter).toBe(2);
  });

  it("accepts a fully persisted identity", () => {
    const persisted: LocalIdentity = {
      clientId: "client:test" as LocalIdentity["clientId"],
      sessionId: "session:test" as LocalIdentity["sessionId"],
      nextObjectCounter: 4,
      nextOperationCounter: 7,
      displayName: "Testeur Agile",
      colorHue: 120,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    expect(loadOrCreateIdentity()).toEqual(persisted);
  });

  it("derives stable color roles from a hue", () => {
    expect(colorForHue(180, "fill")).toContain("hsl(180");
    expect(colorForHue(180, "stroke")).toContain("hsl(180");
    expect(colorForHue(180, "label")).toContain("hsl(180");
  });
});
