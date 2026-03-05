import { HugeiconsIcon } from "@hugeicons/react";
import {
  CenterFocusIcon,
  MinusSignIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";

interface CanvasZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onCenterViewport: () => void;
}

export function CanvasZoomControls({
  onZoomIn,
  onZoomOut,
  onCenterViewport,
}: CanvasZoomControlsProps) {
  return (
    <div className="absolute bottom-4 left-4 z-20 overflow-hidden rounded-md border border-border bg-card shadow-md">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onZoomIn}
          className="grid h-8 w-8 place-items-center border-b border-border text-foreground transition-colors hover:bg-muted"
          aria-label="Zoom avant"
          title="Zoom avant"
        >
          <HugeiconsIcon
            icon={PlusSignIcon}
            className="h-4 w-4"
            strokeWidth={2}
          />
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="grid h-8 w-8 place-items-center border-b border-border text-foreground transition-colors hover:bg-muted"
          aria-label="Zoom arriere"
          title="Zoom arriere"
        >
          <HugeiconsIcon
            icon={MinusSignIcon}
            className="h-4 w-4"
            strokeWidth={2}
          />
        </button>
        <button
          type="button"
          onClick={onCenterViewport}
          className="grid h-8 w-8 place-items-center text-foreground transition-colors hover:bg-muted"
          aria-label="Centrer la vue"
          title="Centrer la vue"
        >
          <HugeiconsIcon
            icon={CenterFocusIcon}
            className="h-4 w-4"
            strokeWidth={2}
          />
        </button>
      </div>
    </div>
  );
}
