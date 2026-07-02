import type { FloorId } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";

export interface PendingOperationEntry {
  operation: MapOperation;
  floorId: FloorId;
  /** Held back from the outbox while a history group is open. */
  deferred?: boolean;
}

/**
 * Server acknowledgements are tracked outside the pending entries so an ack
 * never changes the identity of the pending operation list (and therefore
 * never rebuilds the materialized document).
 */
export type AckedRevisionsByOpId = ReadonlyMap<string, number>;

export interface PendingOperationObservation {
  status: "applied" | "rejected";
  opId: string;
  floorId?: string;
  appliedRevision?: number;
  error?: string;
}

export interface ObservedOperationLogReconciliation {
  pendingEntries: ReadonlyArray<PendingOperationEntry>;
  rejectedOpIds: Array<string>;
  rejectedMessage: string | null;
}

/**
 * All removal helpers preserve the input array identity when nothing was
 * removed, so state setters can bail out instead of looping on
 * content-identical arrays.
 */
const preserveIdentity = <T>(
  entries: ReadonlyArray<T>,
  next: ReadonlyArray<T>,
): ReadonlyArray<T> => (next.length === entries.length ? entries : next);

export const removeAckedPendingOperations = (
  entries: ReadonlyArray<PendingOperationEntry>,
  floorId: FloorId,
  observedRevision: number,
  ackedRevisions: AckedRevisionsByOpId,
): ReadonlyArray<PendingOperationEntry> =>
  preserveIdentity(
    entries,
    entries.filter((entry) => {
      if (entry.floorId !== floorId) return true;
      const ackedRevision = ackedRevisions.get(entry.operation.meta.opId);
      return ackedRevision === undefined || observedRevision < ackedRevision;
    }),
  );

export const pruneAckedRevisionsInPlace = (
  ackedRevisions: Map<string, number>,
  entries: ReadonlyArray<PendingOperationEntry>,
): void => {
  if (ackedRevisions.size === 0) return;

  const pendingOpIds = new Set<string>(
    entries.map((entry) => entry.operation.meta.opId),
  );
  for (const opId of [...ackedRevisions.keys()]) {
    if (!pendingOpIds.has(opId)) ackedRevisions.delete(opId);
  }
};

export const removeObservedOperationLogEntries = (
  entries: ReadonlyArray<PendingOperationEntry>,
  activeFloorId: FloorId,
  observations: ReadonlyArray<PendingOperationObservation>,
): ReadonlyArray<PendingOperationEntry> => {
  const observedByOpId = new Map(
    observations.map((observation) => [observation.opId, observation]),
  );

  return preserveIdentity(
    entries,
    entries.filter((entry) => {
      const observation = observedByOpId.get(entry.operation.meta.opId);
      if (!observation) return true;
      if (observation.status === "rejected") return false;
      if (entry.floorId === activeFloorId) return true;
      return (
        observation.floorId !== entry.floorId ||
        observation.appliedRevision === undefined
      );
    }),
  );
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
