import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashedLine01Icon,
  DashedLine02Icon,
  Eraser01Icon,
  PaintBrush03Icon,
} from "@hugeicons/core-free-icons";
import type { DrawTool } from "@/types/map";
import type { ShortcutAction } from "@/lib/shortcuts";
import { TOOLBAR_ICON_SIZE_CLASS } from "@/lib/constants";

export interface DrawToolbarAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut: ShortcutAction;
  title: string;
  tool: Extract<DrawTool, "wall" | "wall-brush" | "wall-erase" | "room">;
}

export const drawToolbarActions: Array<DrawToolbarAction> = [
  {
    id: "wall",
    tool: "wall",
    label: "Mur",
    shortcut: "tool-wall",
    title: "Dessiner un mur",
    icon: (
      <HugeiconsIcon
        icon={DashedLine01Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    id: "room",
    tool: "room",
    label: "Salle",
    shortcut: "tool-room",
    title: "Dessiner une salle",
    icon: (
      <HugeiconsIcon
        icon={DashedLine02Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    id: "wall-brush",
    tool: "wall-brush",
    label: "Pinceau",
    shortcut: "tool-wall-brush",
    title: "Peindre des murs",
    icon: (
      <HugeiconsIcon
        icon={PaintBrush03Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    id: "wall-erase",
    tool: "wall-erase",
    label: "Supprimer",
    shortcut: "tool-wall-erase",
    title: "Supprimer des murs",
    icon: (
      <HugeiconsIcon
        icon={Eraser01Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
];
