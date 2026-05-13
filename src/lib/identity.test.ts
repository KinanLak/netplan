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
  it("creates and persists only stable display identity", () => {
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
    expect(JSON.parse(stored as string)).toEqual({
      clientId: identity.clientId,
      displayName: identity.displayName,
      colorHue: identity.colorHue,
    });
  });

  it("keeps display identity stable while creating a tab session per load", () => {
    const first = loadOrCreateIdentity();
    const second = loadOrCreateIdentity();
    expect(second.clientId).toBe(first.clientId);
    expect(second.displayName).toBe(first.displayName);
    expect(second.colorHue).toBe(first.colorHue);
    expect(second.sessionId).not.toBe(first.sessionId);
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
    expect(identity.sessionId.startsWith("session:")).toBe(true);
  });

  it("generates object ids namespaced by the tab session", () => {
    const identity = loadOrCreateIdentity();

    const first = createObjectId("device", identity);
    const second = createObjectId("device", identity);

    expect(first).toBe(`device:${identity.clientId}:${identity.sessionId}:0`);
    expect(second).toBe(`device:${identity.clientId}:${identity.sessionId}:1`);
    expect(first).not.toBe(second);
  });

  it("generates operation ids that include the tab session", () => {
    const identity = loadOrCreateIdentity();

    const first = createOperationMeta(identity);
    const second = createOperationMeta(identity);

    expect(first.opId).toBe(`op:${identity.clientId}:${identity.sessionId}:0`);
    expect(second.opId).toBe(`op:${identity.clientId}:${identity.sessionId}:1`);
    expect(first.clientId).toBe(identity.clientId);
    expect(second.clientSeq).toBe(1);
  });

  it("generates different operation and object ids for two tabs", () => {
    const firstTab = loadOrCreateIdentity();
    const secondTab = loadOrCreateIdentity();

    expect(firstTab.clientId).toBe(secondTab.clientId);
    expect(firstTab.sessionId).not.toBe(secondTab.sessionId);
    expect(createOperationMeta(firstTab).opId).not.toBe(
      createOperationMeta(secondTab).opId,
    );
    expect(createObjectId("device", firstTab)).not.toBe(
      createObjectId("device", secondTab),
    );
  });

  it("migrates a legacy fully persisted identity to display-only storage", () => {
    const persisted: LocalIdentity = {
      clientId: "client:test" as LocalIdentity["clientId"],
      sessionId: "session:test" as LocalIdentity["sessionId"],
      nextObjectCounter: 4,
      nextOperationCounter: 7,
      displayName: "Testeur Agile",
      colorHue: 120,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));

    const identity = loadOrCreateIdentity();
    expect(identity.clientId).toBe(persisted.clientId);
    expect(identity.displayName).toBe(persisted.displayName);
    expect(identity.colorHue).toBe(persisted.colorHue);
    expect(identity.sessionId).not.toBe(persisted.sessionId);
    expect(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string),
    ).toEqual({
      clientId: persisted.clientId,
      displayName: persisted.displayName,
      colorHue: persisted.colorHue,
    });
  });

  it("derives stable color roles from a hue", () => {
    expect(colorForHue(180, "fill")).toContain("hsl(180");
    expect(colorForHue(180, "stroke")).toContain("hsl(180");
    expect(colorForHue(180, "label")).toContain("hsl(180");
  });
});
