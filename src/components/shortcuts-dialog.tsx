import { useCallback, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";
import type { ShortcutAction } from "@/lib/shortcuts";
import { useShortcut } from "@/hooks/use-shortcuts";
import { formatHotkey, shortcuts } from "@/lib/shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ShortcutGroup = {
  title: string;
  actions: Array<ShortcutAction>;
};

const shortcutGroups: Array<ShortcutGroup> = [
  {
    title: "Général",
    actions: [
      "toggle-edit-mode",
      "escape",
      "delete",
      "cycle-theme",
      "show-shortcuts",
    ],
  },
  {
    title: "Navigation étages",
    actions: ["floor-up", "floor-down"],
  },
  {
    title: "Outils - Construction",
    actions: ["tool-wall", "tool-room"],
  },
  {
    title: "Outils - Équipements",
    actions: ["tool-rack", "tool-switch", "tool-pc", "tool-wall-port"],
  },
  {
    title: "Panneau de détails",
    actions: ["close-drawer", "delete-device", "highlight-connections"],
  },
  {
    title: "Zoom",
    actions: ["zoom-in", "zoom-out", "zoom-reset"],
  },
];

/**
 * Dialog showing all keyboard shortcuts, opened with "?" key.
 * Includes a floating help button in the bottom-right corner.
 */
export function ShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDialog = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useShortcut("show-shortcuts", toggleDialog);

  return (
    <>
      {/* Floating help button - hidden when dialog is open */}
      {!isOpen && (
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full shadow-lg"
          title="Afficher les raccourcis clavier"
        >
          <HugeiconsIcon
            icon={HelpCircleIcon}
            size={20}
            color="currentColor"
            strokeWidth={1.5}
          />
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Raccourcis clavier</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 pt-4">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  {group.title}
                </h3>
                <ul className="space-y-2">
                  {group.actions.map((action) => {
                    const config = shortcuts[action];
                    // Get first hotkey (if array, take first element)
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
                          {config.description ?? config.label}
                        </span>
                        <KbdGroup>
                          {keyParts.map((key, index) => (
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

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <p className="text-center text-xs text-muted-foreground">
              Maintenez <Kbd className="mx-1">⌥</Kbd> pour voir les raccourcis
              en contexte
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Appuyez <Kbd className="mx-1">?</Kbd> ou{" "}
              <Kbd className="mx-1">esc</Kbd> pour fermer
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
