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
    case "devices.move":
      return { ...operation, meta };
    case "device.delete":
      return { ...operation, meta };
    case "device.place":
      return { ...operation, meta };
    case "device.unplace":
      return { ...operation, meta };
    case "walls.add":
      return { ...operation, meta };
    case "walls.delete":
      return { ...operation, meta };
    case "overlay.set":
      return { ...operation, meta };
    case "overlay.patch":
      return { ...operation, meta };
    case "label.create":
      return { ...operation, meta };
    case "label.patch":
      return { ...operation, meta };
    case "label.delete":
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

  const move = mergeGroupMoves(operations);
  if (move) return move;

  const batchOperations = toBatchSubOperations(operations);
  return batchOperations.length === 0
    ? null
    : { kind: "batch", meta: first.meta, operations: batchOperations };
};

type GroupMoveOperation = Extract<MapOperation, { kind: "devices.move" }>;

/**
 * A held arrow key moving the same group: one move by the sum of the steps,
 * whose straight path is the one the steps took.
 */
const mergeGroupMoves = (
  operations: ReadonlyArray<MapOperation>,
): GroupMoveOperation | null => {
  const [first] = operations;
  if (first.kind !== "devices.move") return null;
  const ids = new Set<string>(first.from.map((member) => member.deviceId));
  const moves = operations.filter(
    (operation): operation is GroupMoveOperation =>
      operation.kind === "devices.move" &&
      operation.from.length === ids.size &&
      operation.from.every((member) => ids.has(member.deviceId)),
  );
  if (moves.length !== operations.length) return null;
  return {
    ...first,
    offset: moves.reduce(
      (sum, move) => ({ x: sum.x + move.offset.x, y: sum.y + move.offset.y }),
      { x: 0, y: 0 },
    ),
  };
};

/**
 * What the toolbar flashes for (A19): an undo or a redo flashes neutral, a
 * refused change red.
 */
export type MapFlash = "undo" | "redo" | "refused";

export const dispatchUndoRedoEvent = (type: MapFlash) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UNDO_REDO_EVENT_NAME, { detail: { type } }),
  );
};

/**
 * What an undone deletion says when some of its cables no longer fit: their
 * far end has gone or holds another cable since (4.1).
 */
export const droppedCablesMessage = (count: number): string =>
  count === 1
    ? "1 câble n'a pas pu être rebranché."
    : `${count} câbles n'ont pas pu être rebranchés.`;
