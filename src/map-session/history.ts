import type { BatchSubOperation, MapOperation } from "@/map-engine/types";
import type { OperationMeta } from "@/types/map";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";

type WallAddOperation = Extract<MapOperation, { kind: "walls.add" }>;
type WallDeleteOperation = Extract<MapOperation, { kind: "walls.delete" }>;

export interface SessionHistoryEntry {
  label: string;
  operation: MapOperation;
  sourceOpIds: ReadonlyArray<string>;
}

export interface PendingHistoryOperationLike<TOperation> {
  operation: TOperation;
  sourceOpId: string;
}

export interface TemporalView {
  pastStates: ReadonlyArray<SessionHistoryEntry>;
  futureStates: ReadonlyArray<SessionHistoryEntry>;
}

export const HISTORY_LIMIT = 200;

export const appendCappedHistory = (
  stack: ReadonlyArray<SessionHistoryEntry>,
  entry: SessionHistoryEntry,
): ReadonlyArray<SessionHistoryEntry> => {
  const next = [...stack, entry];
  return next.length > HISTORY_LIMIT
    ? next.slice(next.length - HISTORY_LIMIT)
    : next;
};

export const removeHistoryEntriesForOperation = (
  stack: ReadonlyArray<SessionHistoryEntry>,
  opId: string,
): ReadonlyArray<SessionHistoryEntry> =>
  stack.filter((entry) => !entry.sourceOpIds.includes(opId));

export const removePendingHistoryGroupOperation = <TOperation>(
  group: ReadonlyArray<PendingHistoryOperationLike<TOperation>>,
  opId: string,
): Array<PendingHistoryOperationLike<TOperation>> =>
  group.filter((entry) => entry.sourceOpId !== opId);

export const withOperationMeta = (
  operation: MapOperation,
  meta: OperationMeta,
): MapOperation => {
  switch (operation.kind) {
    case "device.create":
      return { ...operation, meta };
    case "device.patch":
      return { ...operation, meta };
    case "device.delete":
      return { ...operation, meta };
    case "link.create":
      return { ...operation, meta };
    case "link.delete":
      return { ...operation, meta };
    case "walls.add":
      return { ...operation, meta };
    case "walls.delete":
      return { ...operation, meta };
    case "batch":
      return {
        ...operation,
        meta,
      };
  }
};

export const withoutOperationMeta = (
  operation: MapOperation,
): BatchSubOperation | null => {
  if (operation.kind === "batch") return null;
  const { meta: _meta, ...withoutMeta } = operation;
  return withoutMeta;
};

const isWallAddOperation = (
  operation: MapOperation,
): operation is WallAddOperation => operation.kind === "walls.add";

const isWallDeleteOperation = (
  operation: MapOperation,
): operation is WallDeleteOperation => operation.kind === "walls.delete";

const toBatchSubOperations = (
  operations: ReadonlyArray<MapOperation>,
): Array<BatchSubOperation> =>
  operations.flatMap((operation) => {
    if (operation.kind === "batch") return operation.operations;
    const withoutMeta = withoutOperationMeta(operation);
    return withoutMeta ? [withoutMeta] : [];
  });

export const coalesceHistoryGroupOperations = (
  operations: ReadonlyArray<MapOperation>,
): MapOperation | null => {
  if (operations.length === 0) return null;
  const first = operations[0];
  if (operations.length === 1) return first;

  if (operations.every(isWallAddOperation)) {
    const wallsById = new Map(
      operations.flatMap((operation) =>
        operation.walls.map((wall) => [wall.id, wall] as const),
      ),
    );
    return {
      kind: "walls.add",
      meta: first.meta,
      walls: [...wallsById.values()],
    };
  }

  if (operations.every(isWallDeleteOperation)) {
    return {
      kind: "walls.delete",
      meta: first.meta,
      wallIds: [
        ...new Set(operations.flatMap((operation) => operation.wallIds)),
      ],
    };
  }

  const batchOperations = toBatchSubOperations(operations);
  return batchOperations.length === 0
    ? null
    : { kind: "batch", meta: first.meta, operations: batchOperations };
};

export const dispatchUndoRedoEvent = (type: "undo" | "redo") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UNDO_REDO_EVENT_NAME, { detail: { type } }),
  );
};
