import { describe, expect, it } from "bun:test";
import type { Position } from "@/types/map";
import { createDevicePlacement } from "./devicePlacement";

const floorId = "floor-a";
const size = { width: 20, height: 20 };

const toKey = (position: Position): string => `${position.x},${position.y}`;

describe("device placement", () => {
  it("snaps and keeps an exact add position when it is available", () => {
    const placement = createDevicePlacement({
      checkCollision: () => false,
    });

    const result = placement.resolve({
      kind: "add",
      floorId,
      requestedPosition: { x: 11, y: 29 },
      size,
    });

    expect(result).toEqual({
      ok: true,
      position: { x: 20, y: 20 },
      status: "exact",
    });
  });

  it("relocates an add request to the nearest valid position", () => {
    const blockedPositions = new Set(["20,20"]);
    const placement = createDevicePlacement({
      checkCollision: (_, __, position) =>
        blockedPositions.has(toKey(position)),
    });

    const result = placement.resolve({
      kind: "add",
      floorId,
      requestedPosition: { x: 11, y: 29 },
      size,
    });

    expect(result).toEqual({
      ok: true,
      position: { x: 0, y: 20 },
      status: "relocated",
    });
  });

  it("fails an add request when no valid position exists", () => {
    const blockedPositions = new Set([
      "0,0",
      "0,20",
      "0,40",
      "20,0",
      "20,20",
      "20,40",
      "40,0",
      "40,20",
      "40,40",
    ]);
    const placement = createDevicePlacement({
      checkCollision: (_, __, position) =>
        blockedPositions.has(toKey(position)),
      maxSearchRadius: 20,
    });

    const result = placement.resolve({
      kind: "add",
      floorId,
      requestedPosition: { x: 20, y: 20 },
      size,
    });

    expect(result).toEqual({
      ok: false,
      reason: "no-valid-position",
    });
  });

  it("reuses the last valid drag position when the requested area stays blocked", () => {
    const blockedPositions = new Set(["80,20"]);
    const placement = createDevicePlacement({
      checkCollision: (_, __, position) =>
        blockedPositions.has(toKey(position)),
      maxSearchRadius: 0,
    });

    const firstDrag = placement.resolve({
      kind: "drag",
      deviceId: "device-1",
      floorId,
      requestedPosition: { x: 21, y: 20 },
      size,
      startPosition: { x: 0, y: 20 },
    });
    const secondDrag = placement.resolve({
      kind: "drag",
      deviceId: "device-1",
      floorId,
      requestedPosition: { x: 80, y: 20 },
      size,
      startPosition: { x: 0, y: 20 },
    });

    expect(firstDrag).toEqual({
      ok: true,
      position: { x: 20, y: 20 },
      status: "exact",
    });
    expect(secondDrag).toEqual({
      ok: true,
      position: { x: 20, y: 20 },
      status: "reused-last-valid",
    });
    expect(placement.commitDrag("device-1")).toEqual({ x: 20, y: 20 });
    expect(placement.commitDrag("device-1")).toBe(null);
  });

  it("reuses the last valid drag position while the pointer stays in the same grid cell", () => {
    const placement = createDevicePlacement({
      checkCollision: () => false,
    });

    const firstDrag = placement.resolve({
      kind: "drag",
      deviceId: "device-1",
      floorId,
      requestedPosition: { x: 21, y: 20 },
      size,
      startPosition: { x: 0, y: 20 },
    });
    const secondDrag = placement.resolve({
      kind: "drag",
      deviceId: "device-1",
      floorId,
      requestedPosition: { x: 24, y: 20 },
      size,
      startPosition: { x: 0, y: 20 },
    });

    expect(firstDrag).toEqual({
      ok: true,
      position: { x: 20, y: 20 },
      status: "exact",
    });
    expect(secondDrag).toEqual({
      ok: true,
      position: { x: 20, y: 20 },
      status: "reused-last-valid",
    });
  });
});
