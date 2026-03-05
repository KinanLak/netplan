import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { SHORTCUT_GROUP_GRID_COLUMN_COUNT } from "@/lib/constants";
import { isMac } from "@/lib/shortcuts";
import {
  buildBalancedShortcutGrid,
  shortcutGroups,
} from "@/lib/shortcut-groups";
import { useShortcut } from "@/hooks/use-shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ShortcutGroupGrid } from "@/components/ShortcutGroupGrid";
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

          <div className="pt-4">
            <ShortcutGroupGrid
              groups={orderedShortcutGroups}
              labelKey="description"
            />
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
