import { useOptionHeld } from "@/hooks/use-shortcuts";
import { isMac } from "@/lib/shortcuts";
import { SHORTCUT_GROUP_GRID_COLUMN_COUNT } from "@/lib/constants";
import {
  buildBalancedShortcutGrid,
  shortcutGroups,
} from "@/lib/shortcut-groups";
import { Kbd } from "@/components/ui/kbd";
import { ShortcutGroupGrid } from "@/components/ShortcutGroupGrid";
import { cn } from "@/lib/utils";

const orderedShortcutGroups = buildBalancedShortcutGrid(
  shortcutGroups,
  SHORTCUT_GROUP_GRID_COLUMN_COUNT,
);

/**
 * Overlay panel that shows all keyboard shortcuts when the modifier key is held.
 * Similar to Linear's keyboard shortcuts overlay.
 */
export function ShortcutsOverlay() {
  const { isVisible: isModifierVisible } = useOptionHeld();
  const overlayModifierLabel = isMac ? "⌘" : "Ctrl";

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-200",
        isModifierVisible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div
        className={cn(
          "w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl transition-all duration-200",
          isModifierVisible ? "scale-100" : "scale-95",
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            Raccourcis clavier
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Maintenez</span>
            <Kbd>{overlayModifierLabel}</Kbd>
            <span>pour voir</span>
          </div>
        </div>

        <ShortcutGroupGrid groups={orderedShortcutGroups} />

        <div className="mt-6 border-t border-border pt-4">
          <p className="text-center text-xs text-muted-foreground">
            Les raccourcis apparaissent aussi en contexte sur les boutons
          </p>
        </div>
      </div>
    </div>
  );
}
