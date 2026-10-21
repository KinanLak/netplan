import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import { SHORTCUT_GROUP_GRID_COLUMN_COUNT } from "@/lib/constants";
import { isMac } from "@/lib/shortcuts";
import {
  buildBalancedShortcutGrid,
  shortcutGroupsFor,
} from "@/lib/shortcut-groups";
import { useCanEdit } from "@/hooks/use-current-user";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { Kbd } from "@/components/ui/kbd";
import { ShortcutGroupGrid } from "@/components/ShortcutGroupGrid";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ShortcutsDialogProps = {
  hasRightDrawerOpen: boolean;
};

/**
 * The map's keyboard shortcuts, opened with "?" or the help button, as the
 * user's role allows them.
 */
export function ShortcutsDialog({ hasRightDrawerOpen }: ShortcutsDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const canEdit = useCanEdit();
  const groups = buildBalancedShortcutGrid(
    shortcutGroupsFor(canEdit),
    SHORTCUT_GROUP_GRID_COLUMN_COUNT,
  );
  const overlayModifierLabel = isMac ? "⌘" : "Ctrl";

  useShortcutIntentEffect("show-shortcuts", () => {
    setIsOpen((prev) => !prev);
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {/* Stays mounted while the dialog is open, so closing it gives the
          focus back to this button. */}
      <DialogTrigger
        className={`absolute bottom-4 z-30 flex h-10 w-10 items-center justify-center rounded-full transition-[right] hover:border-accent hover:bg-muted hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden ${
          hasRightDrawerOpen ? "right-84" : "right-4"
        }`}
        title="Afficher les raccourcis clavier"
        aria-label="Raccourcis clavier"
      >
        <HugeiconsIcon
          icon={HelpCircleIcon}
          size={25}
          strokeWidth={1.5}
          className="text-muted-foreground"
        />
      </DialogTrigger>

      <DialogContent className="flex max-h-[85vh] max-w-2xl! flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>Raccourcis clavier</DialogTitle>
        </DialogHeader>

        {/* The shadows at either end say there is more to scroll. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 scroll-shadow-y">
          <ShortcutGroupGrid groups={groups} />
        </div>

        <p className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
          Maintenez <Kbd className="mx-1">{overlayModifierLabel}</Kbd> pour voir
          les raccourcis sur les boutons, <Kbd className="mx-1">Échap</Kbd> pour
          fermer
        </p>
      </DialogContent>
    </Dialog>
  );
}
