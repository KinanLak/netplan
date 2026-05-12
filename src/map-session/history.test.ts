import { describe, expect, it } from "bun:test";
import type { DeviceId, FloorId, OperationMeta } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import {
  appendCappedHistory,
  HISTORY_LIMIT,
  removeHistoryEntriesForOperation,
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
      operations: [operation(1), operation(2)],
    };

    const refreshed = withOperationMeta(batch, nextMeta);

    expect(refreshed.meta).toBe(nextMeta);
    if (refreshed.kind !== "batch") return;
    expect(refreshed.operations.every((item) => item.meta === nextMeta)).toBe(
      true,
    );
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
});
