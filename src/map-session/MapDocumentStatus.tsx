import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSelectedDeviceId } from "@/store/selectors";
import {
  useMapDocumentActions,
  useMapDocumentReady,
  useMapDocumentSyncStatus,
} from "./useMapDocument";
import { FORBIDDEN_REJECTION } from "./outbox";

// Long enough to see the tick, short enough to be gone before the next edit.
const SETTLED_MS = 1_000;

/** The server rejects map operations with French sentences (ADR 0026). */
export const getRejectedOperationMessage = (message: string): string =>
  message === FORBIDDEN_REJECTION
    ? "Action refusée : votre rôle ne permet pas de modifier le plan."
    : message;

/**
 * `floorless` when the map shows no floor: there is no document to load, but
 * edits made on another floor may still be saving or be refused.
 */
export function MapDocumentStatus({
  floorless = false,
}: {
  floorless?: boolean;
}) {
  const isReady = useMapDocumentReady() || floorless;
  const {
    isSaving,
    isRetrying,
    hasBackgroundPendingOperations,
    rejectedMessage,
  } = useMapDocumentSyncStatus();
  const { dismissRejectedOperation } = useMapDocumentActions();

  // A refusal is a toast like every other one; the circle below only says
  // what the document is doing.
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
  const busy = statusMessage !== null;
  const drawerOpen = useSelectedDeviceId() !== null;

  // A save that ends shows a tick for a moment, then the circle fades; the
  // end of loading does not, nor a save the server refused, whichever of the
  // refusal and the end of the save the page hears first.
  const saving = busy && isReady;
  const [wasSaving, setWasSaving] = useState(saving);
  const [settled, setSettled] = useState(false);
  const [refused, setRefused] = useState(false);
  if (rejectedMessage !== null && !refused) {
    setRefused(true);
    setSettled(false);
  }
  if (saving !== wasSaving) {
    setWasSaving(saving);
    setSettled(!saving && !busy && !refused && rejectedMessage === null);
    setRefused(false);
  }
  useEffect(() => {
    if (!settled) return;
    const timeout = window.setTimeout(() => setSettled(false), SETTLED_MS);
    return () => window.clearTimeout(timeout);
  }, [settled]);

  if (!busy && !settled) return null;

  return (
    <div
      // Beside the help button, which moves with the drawer.
      className={cn(
        "pointer-events-none absolute bottom-5.5 z-30 transition-[right]",
        drawerOpen ? "right-96" : "right-16",
      )}
      role="status"
      aria-live="polite"
      title={statusMessage ?? "Modifications enregistrées"}
    >
      <span className="sr-only">
        {statusMessage ?? "Modifications enregistrées"}
      </span>
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full border border-border bg-card shadow-sm animate-in fade-in-0 zoom-in-75",
          settled &&
            "animate-out fade-out-0 zoom-out-75 fill-mode-forwards delay-700 duration-300",
        )}
      >
        {busy ? (
          <span
            className={cn(
              "size-3.5 animate-spin rounded-full border-2 border-muted border-t-foreground",
              isRetrying && "border-t-down",
            )}
          />
        ) : (
          <HugeiconsIcon
            icon={Tick02Icon}
            size={16}
            strokeWidth={2}
            className="animate-in text-up zoom-in-50"
          />
        )}
      </span>
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
