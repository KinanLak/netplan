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
  const { rejectedMessage, dismissRejectedOperation } = useMapDocument();

  if (!rejectedMessage) return null;

  return (
    <div className="pointer-events-none absolute right-4 bottom-4 z-30 max-w-sm">
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
    </div>
  );
}
