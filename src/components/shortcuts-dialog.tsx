import { useCallback, useState } from "react";
import type { ShortcutAction } from "@/lib/shortcuts";
import { useShortcut } from "@/hooks/use-shortcuts";
import { formatShortcutKey, shortcuts } from "@/lib/shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
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
    actions: ["toggle-edit-mode", "escape", "delete", "show-shortcuts"],
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
    title: "Barre d'outils (1-6)",
    actions: [
      "hotbar-1",
      "hotbar-2",
      "hotbar-3",
      "hotbar-4",
      "hotbar-5",
      "hotbar-6",
    ],
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
 */
export function ShortcutsDialog() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleDialog = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  useShortcut("show-shortcuts", toggleDialog);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Raccourcis clavier</span>
            <div className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <span>Appuyez</span>
              <KbdGroup>
                <Kbd>?</Kbd>
              </KbdGroup>
              <span>pour fermer</span>
            </div>
          </DialogTitle>
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
                  const firstKey = config.keys[0];
                  const keyParts = formatShortcutKey(firstKey);

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

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-center text-xs text-muted-foreground">
            Maintenez <Kbd className="mx-1">⌥</Kbd> pour voir les raccourcis en
            contexte
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
