import { HugeiconsIcon } from "@hugeicons/react";
import {
  BrickWallIcon,
  Eraser01Icon,
  PaintBrush03Icon,
  SquareIcon,
} from "@hugeicons/core-free-icons";
import type { DrawTool } from "@/types/map";
import type { ShortcutAction } from "@/lib/shortcuts";
import { TOOLBAR_ICON_SIZE_CLASS } from "@/lib/constants";

export interface DrawToolbarAction {
  id: string;
  icon: React.ReactNode;
  shortcut: ShortcutAction;
  /** What the tool does, named on hover and to a screen reader. */
  title: string;
  tool: Extract<DrawTool, "wall" | "wall-brush" | "wall-erase" | "room">;
}

export const drawToolbarActions: Array<DrawToolbarAction> = [
  {
    id: "wall",
    tool: "wall",
    shortcut: "tool-wall",
    title: "Dessiner un mur",
    icon: (
      <HugeiconsIcon
        icon={BrickWallIcon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    id: "room",
    tool: "room",
    shortcut: "tool-room",
    title: "Dessiner une salle",
    icon: (
      <HugeiconsIcon
        icon={SquareIcon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    id: "wall-brush",
    tool: "wall-brush",
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
    shortcut: "tool-wall-erase",
    title: "Effacer des murs",
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
