import type { FloorId } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";

export interface PendingOperationEntry {
  operation: MapOperation;
  floorId: FloorId;
  ackedRevision?: number;
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
