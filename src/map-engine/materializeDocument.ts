import type { MapDocumentSnapshot } from "@/types/map";
import { applyOperations } from "./applyOperation";
import type { MapOperation } from "./types";

export function materializeDocument(
  serverDocument: MapDocumentSnapshot,
  pendingOperations: ReadonlyArray<MapOperation>,
): MapDocumentSnapshot {
  return applyOperations(serverDocument, pendingOperations).snapshot;
}
