import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { SHORTCUT_GROUP_GRID_COLUMN_COUNT } from "@/lib/constants";
import { formatHotkey, isMac, shortcuts } from "@/lib/shortcuts";
import {
  buildBalancedShortcutGrid,
  shortcutGroups,
} from "@/lib/shortcut-groups";
import { useShortcut } from "@/hooks/use-shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const orderedShortcutGroups = buildBalancedShortcutGrid(
  shortcutGroups,
  SHORTCUT_GROUP_GRID_COLUMN_COUNT,
);

type ShortcutsDialogProps = {
  hasRightDrawerOpen: boolean;
};

/**
 * Dialog showing all keyboard shortcuts, opened with "?" key.
 * Includes a floating help button in the bottom-right corner.
 */
export function ShortcutsDialog({ hasRightDrawerOpen }: ShortcutsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const overlayModifierLabel = isMac ? "⌘" : "Ctrl";

  useShortcut("show-shortcuts", () => {
    setIsOpen((prev) => !prev);
  });

  return (
    <>
      {/* Floating help button - hidden when dialog is open */}
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`absolute bottom-4 z-30 flex h-10 w-10 items-center justify-center rounded-full transition-[right] hover:border-accent hover:bg-muted hover:shadow-lg ${
            hasRightDrawerOpen ? "right-84" : "right-4"
          }`}
          title="Afficher les raccourcis clavier"
        >
          <HugeiconsIcon
            icon={HelpCircleIcon}
            size={25}
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
        </button>
      ) : null}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl! overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raccourcis clavier</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 pt-4">
            {orderedShortcutGroups.map((group) => (
              <div key={group.id}>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {group.title}
                </h3>
                <ul className="space-y-2">
                  {group.actions.map((action) => {
                    const config = shortcuts[action];
                    const keyCombinations = Array.from(
                      new Map(
                        config.keys
                          .map((hotkey) => formatHotkey(hotkey))
                          .map((keys) => [keys.join("+"), keys]),
                      ).values(),
                    );

                    return (
                      <li
                        key={action}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="text-sm text-foreground">
                          {config.description ?? config.label}
                        </span>
                        <span className="flex items-center gap-1">
                          {keyCombinations.map((keys, keyGroupIndex) => {
                            const keyGroupKey = `${action}-${keyGroupIndex}`;

                            return (
                              <span
                                key={keyGroupKey}
                                className="flex items-center gap-1"
                              >
                                {keyGroupIndex > 0 ? (
                                  <span className="text-xs text-muted-foreground">
                                    /
                                  </span>
                                ) : null}
                                <KbdGroup>
                                  {keys.map((key, keyIndex) => (
                                    <Kbd key={`${keyGroupKey}-${keyIndex}`}>
                                      {key}
                                    </Kbd>
                                  ))}
                                </KbdGroup>
                              </span>
                            );
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-center text-xs text-muted-foreground">
              Maintenez <Kbd className="mx-1">{overlayModifierLabel}</Kbd> pour
              voir les raccourcis en contexte
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Appuyez sur{" "}
              <KbdGroup className="mx-1">
                <Kbd>Shift</Kbd>
                <Kbd>?</Kbd>
              </KbdGroup>{" "}
              ou <Kbd className="mx-1">esc</Kbd> pour fermer
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
