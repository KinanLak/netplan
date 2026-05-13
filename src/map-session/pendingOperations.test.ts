import { describe, expect, it } from "bun:test";
import type { DeviceId, FloorId, OperationMeta } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import {
  reconcileObservedOperationLogEntries,
  removeObservedOperationLogEntries,
  removeObservedPendingOperations,
} from "./pendingOperations";

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

  it("removes applied background operations from operation log observations", () => {
    const background = {
      operation: operation(1, floorB),
      floorId: floorB,
      ackedRevision: 2,
    };
    const active = {
      operation: operation(2, floorA),
      floorId: floorA,
      ackedRevision: 2,
    };

    expect(
      removeObservedOperationLogEntries([background, active], floorA, [
        {
          status: "applied",
          opId: background.operation.meta.opId,
          floorId: floorB,
          appliedRevision: 2,
        },
        {
          status: "applied",
          opId: active.operation.meta.opId,
          floorId: floorA,
          appliedRevision: 2,
        },
      ]),
    ).toEqual([active]);
  });

  it("keeps background applied operations without enough floor revision data", () => {
    const background = {
      operation: operation(1, floorB),
      floorId: floorB,
      ackedRevision: 2,
    };

    expect(
      removeObservedOperationLogEntries([background], floorA, [
        { status: "applied", opId: background.operation.meta.opId },
      ]),
    ).toEqual([background]);
  });

  it("removes rejected operations on active and background floors", () => {
    const background = { operation: operation(1, floorB), floorId: floorB };
    const active = { operation: operation(2, floorA), floorId: floorA };

    expect(
      removeObservedOperationLogEntries([background, active], floorA, [
        { status: "rejected", opId: background.operation.meta.opId },
        { status: "rejected", opId: active.operation.meta.opId },
      ]),
    ).toEqual([]);
  });

  it("summarizes provider-style operation log reconciliation", () => {
    const background = { operation: operation(1, floorB), floorId: floorB };
    const active = { operation: operation(2, floorA), floorId: floorA };

    const result = reconcileObservedOperationLogEntries(
      [background, active],
      floorA,
      [
        {
          status: "applied",
          opId: background.operation.meta.opId,
          floorId: floorB,
          appliedRevision: 3,
        },
        {
          status: "rejected",
          opId: active.operation.meta.opId,
          error: "Device not found",
        },
      ],
    );

    expect(result.pendingEntries).toEqual([]);
    expect(result.rejectedOpIds).toEqual([active.operation.meta.opId]);
    expect(result.rejectedMessage).toBe("Device not found");
  });
});
