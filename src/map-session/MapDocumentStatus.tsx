import { useEffect } from "react";
import { toast } from "sonner";
import {
  useMapDocumentActions,
  useMapDocumentReady,
  useMapDocumentSyncStatus,
} from "./useMapDocument";
import { FORBIDDEN_REJECTION } from "./outbox";

/** The server rejects map operations with French sentences (ADR 0026). */
export const getRejectedOperationMessage = (message: string): string =>
  message === FORBIDDEN_REJECTION
    ? "Action refusée : votre rôle ne permet pas de modifier le plan."
    : message;

export function MapDocumentStatus() {
  const isReady = useMapDocumentReady();
  const {
    isSaving,
    isRetrying,
    hasBackgroundPendingOperations,
    rejectedMessage,
  } = useMapDocumentSyncStatus();
  const { dismissRejectedOperation } = useMapDocumentActions();

  // A refusal is a toast like every other one; the card below only says what
  // the document is doing.
  useEffect(() => {
    if (!rejectedMessage) return;
    toast.error("Modification non appliquée", {
      description: getRejectedOperationMessage(rejectedMessage),
    });
    dismissRejectedOperation();
  }, [rejectedMessage, dismissRejectedOperation]);

  const statusMessage = getDocumentActivityMessage({
    isReady,
    isSaving,
    isRetrying,
    hasBackgroundPendingOperations,
  });

  if (!statusMessage) return null;

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-30 max-w-sm">
      <div
        className="rounded-xl border border-border bg-card p-3 text-sm text-card-foreground shadow-lg"
        role="status"
        aria-live="polite"
      >
        <div className="font-medium">
          {!isReady
            ? "Plan indisponible"
            : isRetrying
              ? "Nouvelle tentative"
              : "Sauvegarde"}
        </div>
        <p className="mt-1 text-muted-foreground">{statusMessage}</p>
      </div>
    </div>
  );
}

export const getDocumentActivityMessage = ({
  isReady,
  isSaving,
  isRetrying,
  hasBackgroundPendingOperations,
}: {
  isReady: boolean;
  isSaving: boolean;
  isRetrying: boolean;
  hasBackgroundPendingOperations: boolean;
}): string | null => {
  if (!isReady) return "Chargement du plan…";
  if (isRetrying) return "Reconnexion et nouvelle tentative d'enregistrement…";
  if (!isSaving) return null;
  return hasBackgroundPendingOperations
    ? "Enregistrement de modifications sur plusieurs étages…"
    : "Enregistrement en cours…";
};
