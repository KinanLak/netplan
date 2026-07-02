import { useContext } from "react";
import type { Context } from "react";
import {
  MapDocumentActionsContext,
  MapDocumentDataContext,
  MapDocumentHistoryContext,
  MapDocumentReadyContext,
  MapDocumentSyncStatusContext,
} from "./MapDocumentProvider";
import type {
  MapDocumentActions,
  MapDocumentData,
  MapDocumentHistoryState,
  MapDocumentSyncStatus,
} from "./MapDocumentProvider";

const useRequiredContext = <T>(
  context: Context<T | null>,
  hookName: string,
): T => {
  const value = useContext(context);
  if (value === null) {
    throw new Error(`${hookName} must be used inside MapDocumentProvider`);
  }
  return value;
};

/** Materialized document — re-renders on local edits and server updates. */
export const useMapDocumentData = (): MapDocumentData =>
  useRequiredContext(MapDocumentDataContext, "useMapDocumentData");

/** Session readiness — only flips on floor switches and initial load. */
export const useMapDocumentReady = (): boolean =>
  useRequiredContext(MapDocumentReadyContext, "useMapDocumentReady");

/** Save/connection status — re-renders with the outbox lifecycle. */
export const useMapDocumentSyncStatus = (): MapDocumentSyncStatus =>
  useRequiredContext(MapDocumentSyncStatusContext, "useMapDocumentSyncStatus");

/** Per-floor undo/redo stacks — re-renders on recorded edits. */
export const useMapDocumentHistory = (): MapDocumentHistoryState =>
  useRequiredContext(MapDocumentHistoryContext, "useMapDocumentHistory");

/** Stable imperative session API — never causes re-renders. */
export const useMapDocumentActions = (): MapDocumentActions =>
  useRequiredContext(MapDocumentActionsContext, "useMapDocumentActions");
