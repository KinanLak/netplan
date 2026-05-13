import type { FloorId } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";

export interface PendingOperationEntry {
  operation: MapOperation;
  floorId: FloorId;
  ackedRevision?: number;
}

export interface PendingOperationObservation {
  status: "applied" | "rejected";
  opId: string;
  floorId?: string;
  appliedRevision?: number;
  error?: string;
}

export interface ObservedOperationLogReconciliation {
  pendingEntries: Array<PendingOperationEntry>;
  rejectedOpIds: Array<string>;
  rejectedMessage: string | null;
}

export const removeObservedPendingOperations = (
  entries: ReadonlyArray<PendingOperationEntry>,
  floorId: FloorId,
  observedRevision: number,
): Array<PendingOperationEntry> =>
  entries.filter(
    (entry) =>
      entry.floorId !== floorId ||
      entry.ackedRevision === undefined ||
      observedRevision < entry.ackedRevision,
  );

export const removeObservedOperationLogEntries = (
  entries: ReadonlyArray<PendingOperationEntry>,
  activeFloorId: FloorId,
  observations: ReadonlyArray<PendingOperationObservation>,
): Array<PendingOperationEntry> => {
  const observedByOpId = new Map(
    observations.map((observation) => [observation.opId, observation]),
  );

  return entries.filter((entry) => {
    const observation = observedByOpId.get(entry.operation.meta.opId);
    if (!observation) return true;
    if (observation.status === "rejected") return false;
    if (entry.floorId === activeFloorId) return true;
    return (
      observation.floorId !== entry.floorId ||
      observation.appliedRevision === undefined
    );
  });
};

export const reconcileObservedOperationLogEntries = (
  entries: ReadonlyArray<PendingOperationEntry>,
  activeFloorId: FloorId,
  observations: ReadonlyArray<PendingOperationObservation>,
): ObservedOperationLogReconciliation => {
  const rejected = observations.filter(
    (observation) => observation.status === "rejected",
  );

  return {
    pendingEntries: removeObservedOperationLogEntries(
      entries,
      activeFloorId,
      observations,
    ),
    rejectedOpIds: rejected.map((observation) => observation.opId),
    rejectedMessage:
      rejected.find((observation) => observation.error)?.error ?? null,
  };
};
