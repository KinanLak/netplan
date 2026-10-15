import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import { useIsOverlayHidden } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";

/** Hides the calque for this user only, in reading and editing alike. */
export function OverlayVisibilityButton() {
  const { document } = useMapDocumentData();
  const isHidden = useIsOverlayHidden();
  const toggleOverlayHidden = useMapStore((s) => s.toggleOverlayHidden);
  const hasOverlay = document.overlay?.floorId === document.floorId;

  useShortcutIntentEffect("toggle-overlay-visibility", toggleOverlayHidden, {
    enabled: hasOverlay,
  });

  if (!hasOverlay) return null;

  const label = isHidden ? "Afficher le calque" : "Masquer le calque";
  return (
    <div className="absolute bottom-4 left-15 z-20">
      <button
        type="button"
        onClick={toggleOverlayHidden}
        aria-pressed={isHidden}
        aria-label={label}
        title={label}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-md border border-border bg-card shadow-md transition-colors hover:bg-muted",
          isHidden ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <HugeiconsIcon
          icon={isHidden ? ViewOffSlashIcon : ViewIcon}
          className="h-4 w-4"
          strokeWidth={2}
        />
      </button>
      <ShortcutHintAbsolute
        action="toggle-overlay-visibility"
        position="top-right"
      />
    </div>
  );
}
