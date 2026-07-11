import { describe, expect, it } from "bun:test";
import type { DeviceId, FloorId, OperationMeta } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import {
  appendPendingOperation,
  pruneAckedRevisionsInPlace,
  reconcileObservedOperationLogEntries,
  removeAckedPendingOperations,
  removeObservedOperationLogEntries,
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

const acked = (pairs: Array<[MapOperation, number]>): Map<string, number> =>
  new Map(pairs.map(([op, revision]) => [op.meta.opId, revision]));

const wallsAddOperation = (seq: number, floorId: FloorId): MapOperation => ({
  kind: "walls.add",
  meta: meta(seq),
  walls: [
    {
      id: `wall:${seq}` as never,
      floorId,
      start: { x: seq * 20, y: 0 },
      end: { x: seq * 20, y: 0 },
      color: "concrete",
      geometryKey: `${floorId}:${seq * 20}:0`,
    },
  ],
});

const wallsDeleteOperation = (seq: number): MapOperation => ({
  kind: "walls.delete",
  meta: meta(seq),
  wallIds: [`wall:${seq}` as never],
});

describe("appendPendingOperation", () => {
  it("merges consecutive deferred walls.add operations of a stroke", () => {
    const first = appendPendingOperation(
      [],
      wallsAddOperation(1, floorA),
      floorA,
      true,
    );
    const second = appendPendingOperation(
      first,
      wallsAddOperation(2, floorA),
      floorA,
      true,
    );

    expect(second).toHaveLength(1);
    const merged = second[0].operation;
    expect(merged.kind).toBe("walls.add");
    if (merged.kind === "walls.add") {
      expect(merged.walls).toHaveLength(2);
    }
    // The merged entry keeps the first operation's identity so history-group
    // replacement by source op ids still matches it.
    expect(merged.meta.opId).toBe(wallsAddOperation(1, floorA).meta.opId);
  });

  it("merges consecutive deferred walls.delete operations of a stroke", () => {
    const first = appendPendingOperation(
      [],
      wallsDeleteOperation(1),
      floorA,
      true,
    );
    const second = appendPendingOperation(
      first,
      wallsDeleteOperation(2),
      floorA,
      true,
    );

    expect(second).toHaveLength(1);
    const merged = second[0].operation;
    if (merged.kind === "walls.delete") {
      expect(merged.wallIds).toHaveLength(2);
    } else {
      throw new Error("expected a walls.delete operation");
    }
  });

  it("does not merge non-deferred operations", () => {
    const first = appendPendingOperation(
      [],
      wallsAddOperation(1, floorA),
      floorA,
      false,
    );
    const second = appendPendingOperation(
      first,
      wallsAddOperation(2, floorA),
      floorA,
      false,
    );

    expect(second).toHaveLength(2);
  });

  it("does not merge across floors or operation kinds", () => {
    const first = appendPendingOperation(
      [],
      wallsAddOperation(1, floorA),
      floorA,
      true,
    );
    const acrossFloor = appendPendingOperation(
      first,
      wallsAddOperation(2, floorB),
      floorB,
      true,
    );
    expect(acrossFloor).toHaveLength(2);

    const acrossKind = appendPendingOperation(
      first,
      wallsDeleteOperation(3),
      floorA,
      true,
    );
    expect(acrossKind).toHaveLength(2);
  });
});

describe("pending operation reconciliation", () => {
  it("keeps acked operations until the server revision is observed", () => {
    const op = operation(1, floorA);
    const entries = [{ operation: op, floorId: floorA }];
    const revisions = acked([[op, 3]]);

    expect(removeAckedPendingOperations(entries, floorA, 2, revisions)).toEqual(
      entries,
    );
    expect(removeAckedPendingOperations(entries, floorA, 3, revisions)).toEqual(
      [],
    );
  });

  it("preserves pending operations for inactive floors", () => {
    const background = { operation: operation(1, floorB), floorId: floorB };
    const active = { operation: operation(2, floorA), floorId: floorA };
    const revisions = acked([
      [background.operation, 1],
      [active.operation, 1],
    ]);

    expect(
      removeAckedPendingOperations([background, active], floorA, 1, revisions),
    ).toEqual([background]);
  });

  it("does not remove unacked operations", () => {
    const entries = [{ operation: operation(1, floorA), floorId: floorA }];

    expect(
      removeAckedPendingOperations(entries, floorA, 99, new Map()),
    ).toEqual(entries);
  });

  it("preserves the array identity when no acked operation is removable", () => {
    const entries = [{ operation: operation(1, floorA), floorId: floorA }];

    expect(removeAckedPendingOperations(entries, floorA, 99, new Map())).toBe(
      entries,
    );
  });

  it("prunes acked revisions for operations that are no longer pending", () => {
    const kept = operation(1, floorA);
    const gone = operation(2, floorA);
    const revisions = acked([
      [kept, 2],
      [gone, 3],
    ]);

    pruneAckedRevisionsInPlace(revisions, [
      { operation: kept, floorId: floorA },
    ]);

    expect([...revisions.keys()]).toEqual([kept.meta.opId]);
  });

  it("keeps acked revisions for operations that are still pending", () => {
    const kept = operation(1, floorA);
    const revisions = acked([[kept, 2]]);

    pruneAckedRevisionsInPlace(revisions, [
      { operation: kept, floorId: floorA },
    ]);

    expect(revisions.get(kept.meta.opId)).toBe(2);
  });

  it("removes applied background operations from operation log observations", () => {
    const background = { operation: operation(1, floorB), floorId: floorB };
    const active = { operation: operation(2, floorA), floorId: floorA };

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
    const background = { operation: operation(1, floorB), floorId: floorB };

    expect(
      removeObservedOperationLogEntries([background], floorA, [
        { status: "applied", opId: background.operation.meta.opId },
      ]),
    ).toEqual([background]);
  });

  it("preserves the array identity when observations remove nothing", () => {
    const active = { operation: operation(1, floorA), floorId: floorA };
    const entries = [active];

    expect(
      removeObservedOperationLogEntries(entries, floorA, [
        {
          status: "applied",
          opId: active.operation.meta.opId,
          floorId: floorA,
          appliedRevision: 2,
        },
      ]),
    ).toBe(entries);
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
