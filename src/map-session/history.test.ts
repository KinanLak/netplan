import { describe, expect, it } from "bun:test";
import type {
  DeviceId,
  FloorId,
  OperationMeta,
  WallId,
  WallSegment,
} from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import {
  appendCappedHistory,
  coalesceHistoryGroupOperations,
  HISTORY_LIMIT,
  removeHistoryEntriesForOperation,
  removePendingHistoryGroupOperation,
  withOperationMeta,
} from "./history";

const floorId = "floor:a" as FloorId;

const meta = (seq: number): OperationMeta => ({
  opId: `op:test:${seq}` as OperationMeta["opId"],
  clientId: "client:test" as OperationMeta["clientId"],
  clientSeq: seq,
  createdAt: seq,
});

const operation = (seq: number): MapOperation => ({
  kind: "device.create",
  meta: meta(seq),
  device: {
    id: `device:${seq}` as DeviceId,
    floorId,
    type: "pc",
    name: "PC",
    position: { x: 0, y: 0 },
    size: { width: 80, height: 80 },
    metadata: {},
  },
});

const createOperation = (
  seq: number,
): Extract<MapOperation, { kind: "device.create" }> => ({
  kind: "device.create",
  meta: meta(seq),
  device: {
    id: `device:${seq}` as DeviceId,
    floorId,
    type: "pc",
    name: "PC",
    position: { x: 0, y: 0 },
    size: { width: 80, height: 80 },
    metadata: {},
  },
});

const wall = (id: string, x: number): WallSegment => ({
  id: id as WallId,
  floorId,
  start: { x, y: 0 },
  end: { x, y: 0 },
  color: "concrete",
  geometryKey: `${x}:0:${x}:0`,
});

describe("session history", () => {
  it("caps history to the configured limit", () => {
    const entries = Array.from({ length: HISTORY_LIMIT + 1 }, (_, index) => ({
      label: "op",
      operation: operation(index),
      sourceOpIds: [`op:test:${index}`],
    })).reduce(appendCappedHistory, []);

    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0]?.operation.meta.clientSeq).toBe(1);
  });

  it("replaces operation metadata recursively for undo/redo dispatch", () => {
    const nextMeta = meta(99);
    const batch: MapOperation = {
      kind: "batch",
      meta: meta(0),
      operations: [
        { kind: "device.create", device: createOperation(1).device },
        { kind: "device.create", device: createOperation(2).device },
      ],
    };

    const refreshed = withOperationMeta(batch, nextMeta);

    expect(refreshed.meta).toBe(nextMeta);
    if (refreshed.kind !== "batch") return;
    expect(refreshed.operations).toEqual(batch.operations);
  });

  it("removes entries associated with a rejected operation", () => {
    const stack = [
      {
        label: "kept",
        operation: operation(1),
        sourceOpIds: ["op:accepted"],
      },
      {
        label: "rejected",
        operation: operation(2),
        sourceOpIds: ["op:rejected"],
      },
      {
        label: "rejected-group",
        operation: operation(3),
        sourceOpIds: ["op:group-a", "op:rejected"],
      },
    ];

    const next = removeHistoryEntriesForOperation(stack, "op:rejected");

    expect(next.map((entry) => entry.label)).toEqual(["kept"]);
  });

  it("coalesces grouped wall adds into one operation", () => {
    const firstWall = wall("wall:a", 0);
    const secondWall = wall("wall:b", 40);

    const grouped = coalesceHistoryGroupOperations([
      { kind: "walls.add", meta: meta(1), walls: [firstWall] },
      { kind: "walls.add", meta: meta(2), walls: [secondWall] },
    ]);

    expect(grouped).toEqual({
      kind: "walls.add",
      meta: meta(1),
      walls: [firstWall, secondWall],
    });
  });

  it("coalesces grouped wall deletes into one operation", () => {
    const grouped = coalesceHistoryGroupOperations([
      { kind: "walls.delete", meta: meta(1), wallIds: ["wall:a" as WallId] },
      {
        kind: "walls.delete",
        meta: meta(2),
        wallIds: ["wall:b" as WallId, "wall:a" as WallId],
      },
    ]);

    expect(grouped).toEqual({
      kind: "walls.delete",
      meta: meta(1),
      wallIds: ["wall:a", "wall:b"],
    });
  });

  it("keeps successful operation entries when another op is rejected", () => {
    const stack = [
      {
        label: "successful",
        operation: operation(1),
        sourceOpIds: ["op:successful"],
      },
    ];

    const next = removeHistoryEntriesForOperation(stack, "op:other");

    expect(next).toEqual(stack);
  });

  it("removes rejected operations from an open history group", () => {
    const group = [
      { operation: operation(1), sourceOpId: "op:accepted" },
      { operation: operation(2), sourceOpId: "op:rejected" },
    ];

    const next = removePendingHistoryGroupOperation(group, "op:rejected");

    expect(next.map((entry) => entry.sourceOpId)).toEqual(["op:accepted"]);
  });

  it("returns an empty group when every pending source was rejected", () => {
    const group = [{ operation: operation(1), sourceOpId: "op:rejected" }];

    expect(removePendingHistoryGroupOperation(group, "op:rejected")).toEqual(
      [],
    );
  });
});
