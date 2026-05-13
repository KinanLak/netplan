import { useMapDocument } from "./useMapDocument";

export const getRejectedOperationMessage = (message: string): string => {
  const normalized = message.toLowerCase();
  if (normalized.includes("collides") || normalized.includes("collision")) {
    return "Action refusee: collision avec un autre element.";
  }
  if (normalized.includes("not found") || normalized.includes("missing")) {
    return "Action refusee: l'element n'est plus disponible.";
  }

  return `Action refusee: ${message}`;
};

export function MapDocumentStatus() {
  const {
    isReady,
    isSaving,
    isRetrying,
    hasBackgroundPendingOperations,
    rejectedMessage,
    dismissRejectedOperation,
  } = useMapDocument();

  const statusMessage = getDocumentActivityMessage({
    isReady,
    isSaving,
    isRetrying,
    hasBackgroundPendingOperations,
  });

  if (!rejectedMessage && !statusMessage) return null;

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-30 max-w-sm">
      <div className="space-y-2">
        {statusMessage ? (
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
        ) : null}
        {rejectedMessage ? (
          <div
            className="pointer-events-auto rounded-xl border border-destructive bg-card p-3 text-sm text-card-foreground shadow-lg"
            role="status"
            aria-live="polite"
          >
            <div className="font-medium">Modification non appliquee</div>
            <p className="mt-1 text-muted-foreground">
              {getRejectedOperationMessage(rejectedMessage)}
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-medium text-primary"
              onClick={dismissRejectedOperation}
            >
              Fermer
            </button>
          </div>
        ) : null}
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
  if (!isReady) return "Chargement du plan...";
  if (isRetrying)
    return "Reconnexion et nouvelle tentative d'enregistrement...";
  if (!isSaving) return null;
  return hasBackgroundPendingOperations
    ? "Enregistrement de modifications sur plusieurs etages..."
    : "Enregistrement en cours...";
};
