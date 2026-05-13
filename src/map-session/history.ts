import type { BatchSubOperation, MapOperation } from "@/map-engine/types";
import type { OperationMeta } from "@/types/map";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";

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

export const dispatchUndoRedoEvent = (type: "undo" | "redo") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UNDO_REDO_EVENT_NAME, { detail: { type } }),
  );
};
