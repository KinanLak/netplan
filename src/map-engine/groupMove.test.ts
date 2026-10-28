import { describe, expect, it } from "bun:test";
import type {
  Device,
  DeviceId,
  FloorId,
  MapDocumentSnapshot,
  WallId,
  WallSegment,
} from "@/types/map";
import { applyOperation } from "./applyOperation";
import { buildInverseOperation } from "./buildInverseOperation";
import { sweepHitsRect } from "./groupMove";
import { validateGroupMove } from "./validation";
import type { MapOperation } from "./types";

const floorId = "floor:a" as FloorId;

const meta = (seq: number): MapOperation["meta"] => ({
  opId: `op:test:${seq}` as MapOperation["meta"]["opId"],
  clientId: "client:test" as MapOperation["meta"]["clientId"],
  clientSeq: seq,
  createdAt: seq,
});

const device = (id: string, x: number, y: number, floor = floorId): Device => ({
  id: id as DeviceId,
  floorId: floor,
  type: "pc",
  name: id,
  position: { x, y },
  size: { width: 40, height: 40 },
  macs: [],
  metadata: {},
});

/** A vertical wall from (x, y1) to (x, y2), 20 thick. */
const wall = (x: number, y1: number, y2: number): WallSegment => ({
  id: `wall:${x}:${y1}` as WallId,
  floorId,
  start: { x, y: y1 },
  end: { x, y: y2 },
  color: "concrete",
  geometryKey: `${x}:${y1}:${x}:${y2}`,
});

const snapshot = (
  devices: Array<Device>,
  walls: Array<WallSegment> = [],
): MapDocumentSnapshot => ({
  floorId,
  revision: 0,
  devices,
  walls,
  ports: [],
  cables: [],
  overlay: null,
  labels: [],
});

const move = (
  deviceIds: Array<string>,
  offset: { x: number; y: number },
  seq = 1,
): MapOperation => ({
  kind: "devices.move",
  meta: meta(seq),
  deviceIds: deviceIds as Array<DeviceId>,
  offset,
});

const positions = (result: MapDocumentSnapshot) =>
  Object.fromEntries(result.devices.map((d) => [d.id, d.position]));

describe("sweepHitsRect", () => {
  const box = { x: 0, y: 0, width: 40, height: 40 };
  const obstacle = { x: 100, y: 0, width: 20, height: 200 };

  it("sees an obstacle passed through on the way, not only at the end", () => {
    expect(sweepHitsRect(box, { x: 200, y: 0 }, obstacle)).toBe(true);
    expect(sweepHitsRect(box, { x: 40, y: 0 }, obstacle)).toBe(false);
  });

  it("lets a rectangle slide along an obstacle or stop against it", () => {
    expect(sweepHitsRect(box, { x: 60, y: 0 }, obstacle)).toBe(false);
    expect(sweepHitsRect({ ...box, x: 60 }, { x: 0, y: 300 }, obstacle)).toBe(
      false,
    );
  });

  it("follows a diagonal past an obstacle's corner", () => {
    const corner = { x: 100, y: 100, width: 20, height: 20 };
    expect(sweepHitsRect(box, { x: 200, y: 200 }, corner)).toBe(true);
    expect(sweepHitsRect(box, { x: 200, y: 0 }, corner)).toBe(false);
  });
});

describe("devices.move", () => {
  it("moves every member by the same offset, keeping the group's shape", () => {
    const before = snapshot([
      device("a", 0, 0),
      device("b", 140, 100),
      device("c", 400, 0),
    ]);
    const result = applyOperation(before, move(["a", "b"], { x: 20, y: 40 }));
    expect(result.applied).toBe(true);
    expect(positions(result.snapshot)).toEqual({
      a: { x: 20, y: 40 },
      b: { x: 160, y: 140 },
      c: { x: 400, y: 0 },
    });
  });

  it("refuses a group spread over floors, a missing member or a repeat", () => {
    const before = snapshot([
      device("a", 0, 0),
      device("b", 100, 0, "floor:b" as FloorId),
    ]);
    expect(
      applyOperation(before, move(["a", "b"], { x: 20, y: 0 })).reason,
    ).toBe("wrong-floor");
    expect(
      applyOperation(before, move(["a", "z"], { x: 20, y: 0 })).reason,
    ).toBe("missing-device");
    expect(
      applyOperation(before, move(["a", "a"], { x: 20, y: 0 })).reason,
    ).toBe("invalid-move");
  });

  it("undoes as one move back, and refuses once a member has moved since", () => {
    const before = snapshot([device("a", 0, 0), device("b", 100, 0)]);
    const operation = move(["a", "b"], { x: 0, y: 60 });
    const inverse = buildInverseOperation(before, operation);
    const after = applyOperation(before, operation).snapshot;

    const undone = applyOperation(after, inverse as MapOperation);
    expect(undone.applied).toBe(true);
    expect(positions(undone.snapshot)).toEqual(positions(before));

    const moved = applyOperation(after, {
      kind: "device.patch",
      meta: meta(2),
      deviceId: "b" as DeviceId,
      patch: { position: { x: 300, y: 300 } },
    }).snapshot;
    expect(applyOperation(moved, inverse as MapOperation).reason).toBe(
      "conflict",
    );
  });
});

describe("validateGroupMove", () => {
  // Two PCs left of a wall at x = 200 that runs from y = 0 to y = 200.
  const room = snapshot(
    [device("a", 100, 40), device("b", 100, 120), device("c", 300, 40)],
    [wall(200, 0, 200)],
  );
  const ids = ["a", "b"] as Array<DeviceId>;

  it("takes a move that keeps every member on its side of a wall", () => {
    expect(validateGroupMove(room, ids, { x: 40, y: 0 }).valid).toBe(true);
  });

  it("refuses a member passing through a wall, even onto free ground", () => {
    expect(validateGroupMove(room, ids, { x: 140, y: 0 })).toEqual({
      valid: false,
      error: "wall-crossing",
    });
  });

  it("refuses a member landing on a wall or on another device", () => {
    expect(validateGroupMove(room, ids, { x: 80, y: 0 }).error).toBe(
      "wall-collision",
    );
    // Below the wall's end, b would stand on c's spot.
    const open = snapshot(room.devices);
    expect(validateGroupMove(open, ids, { x: 200, y: 0 }).error).toBe(
      "device-collision",
    );
  });

  it("lets the members pass over each other's old spots", () => {
    expect(validateGroupMove(room, ids, { x: 0, y: -60 }).valid).toBe(true);
  });
});
