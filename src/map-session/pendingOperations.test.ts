import { describe, expect, it } from "bun:test";
import type { DeviceId, FloorId, OperationMeta } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import { removeObservedPendingOperations } from "./pendingOperations";

const floorA = "floor:a" as FloorId;
const floorB = "floor:b" as FloorId;

const meta = (seq: number): OperationMeta => ({
  opId: `op:test:${seq}` as OperationMeta["opId"],
  clientId: "client:test" as OperationMeta["clientId"],
  clientSeq: seq,
  createdAt: seq,
});

const operation = (seq: number, floorId: FloorId): MapOperation => ({
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

describe("pending operation reconciliation", () => {
  it("keeps acked operations until the server revision is observed", () => {
    const entries = [
      { operation: operation(1, floorA), floorId: floorA, ackedRevision: 3 },
    ];

    expect(removeObservedPendingOperations(entries, floorA, 2)).toEqual(
      entries,
    );
    expect(removeObservedPendingOperations(entries, floorA, 3)).toEqual([]);
  });

  it("preserves pending operations for inactive floors", () => {
    const background = {
      operation: operation(1, floorB),
      floorId: floorB,
      ackedRevision: 1,
    };
    const active = {
      operation: operation(2, floorA),
      floorId: floorA,
      ackedRevision: 1,
    };

    expect(
      removeObservedPendingOperations([background, active], floorA, 1),
    ).toEqual([background]);
  });

  it("does not remove unacked operations", () => {
    const entries = [{ operation: operation(1, floorA), floorId: floorA }];

    expect(removeObservedPendingOperations(entries, floorA, 99)).toEqual(
      entries,
    );
  });
});
