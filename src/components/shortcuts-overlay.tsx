import { useOptionHeld } from "@/hooks/use-shortcuts";
import { formatHotkey, isMac, shortcuts } from "@/lib/shortcuts";
import {
  buildBalancedShortcutGrid,
  shortcutGroups,
} from "@/lib/shortcut-groups";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

const orderedShortcutGroups = buildBalancedShortcutGrid(shortcutGroups, 2);

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

        <div className="grid grid-cols-2 gap-6">
          {orderedShortcutGroups.map((group) => (
            <div key={group.id}>
              <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.actions.map((action) => {
                  const config = shortcuts[action];
                  const firstHotkey = Array.isArray(config.hotkey)
                    ? config.hotkey[0]
                    : config.hotkey;
                  const keyParts = formatHotkey(firstHotkey);

                  return (
                    <li
                      key={action}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-sm text-foreground">
                        {config.label}
                      </span>
                      <KbdGroup>
                        {keyParts.map((key: string, index: number) => (
                          <Kbd key={index}>{key}</Kbd>
                        ))}
                      </KbdGroup>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-border pt-4">
          <p className="text-center text-xs text-muted-foreground">
            Les raccourcis apparaissent aussi en contexte sur les boutons
          </p>
        </div>
      </div>
    </div>
  );
}
