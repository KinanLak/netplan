import { describe, expect, it } from "bun:test";
import {
  colorForHue,
  createLocalIdentity,
  createObjectId,
  createOperationMeta,
} from "./identity";

describe("identity", () => {
  it("starts each page load with a fresh random id and zeroed counters", () => {
    const first = createLocalIdentity();
    const second = createLocalIdentity();

    expect(first.clientId.startsWith("client:")).toBe(true);
    expect(first.clientId).not.toBe(second.clientId);
    expect(first.nextObjectCounter).toBe(0);
    expect(first.nextOperationCounter).toBe(0);
  });

  it("stores nothing in local storage", () => {
    window.localStorage.clear();
    createLocalIdentity();
    expect(window.localStorage.length).toBe(0);
  });

  it("names objects and operations after the page and a counter", () => {
    const identity = createLocalIdentity();

    expect(createObjectId("device", identity)).toBe(
      `device:${identity.clientId}:0`,
    );
    expect(createObjectId("device", identity)).toBe(
      `device:${identity.clientId}:1`,
    );

    const first = createOperationMeta(identity);
    const second = createOperationMeta(identity);
    expect(first.opId).toBe(`op:${identity.clientId}:0`);
    expect(second.opId).toBe(`op:${identity.clientId}:1`);
    expect(second.clientId).toBe(identity.clientId);
    expect(second.clientSeq).toBe(1);
  });

  it("gives two pages different object and operation ids", () => {
    const firstTab = createLocalIdentity();
    const secondTab = createLocalIdentity();

    expect(createOperationMeta(firstTab).opId).not.toBe(
      createOperationMeta(secondTab).opId,
    );
    expect(createObjectId("device", firstTab)).not.toBe(
      createObjectId("device", secondTab),
    );
  });
});

describe("colorForHue", () => {
  it("derives stable color roles from a hue", () => {
    expect(colorForHue(180, "fill")).toContain("hsl(180");
    expect(colorForHue(180, "stroke")).toContain("hsl(180");
    expect(colorForHue(180, "label")).toContain("hsl(180");
  });
});
