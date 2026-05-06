import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashedLine01Icon,
  DashedLine02Icon,
  Eraser01Icon,
  PaintBrush03Icon,
} from "@hugeicons/core-free-icons";
import { deviceKinds } from "@/devices/deviceKindRegistry";
import type { DeviceType, DrawTool } from "@/types/map";
import type { ShortcutAction } from "@/lib/shortcuts";
import { TOOLBAR_ICON_SIZE_CLASS } from "@/lib/constants";

interface ToolbarActionBase {
  group: "draw" | "device";
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut: ShortcutAction;
  title: string;
}

export interface DeviceToolbarAction extends ToolbarActionBase {
  group: "device";
  type: DeviceType;
}

export interface DrawToolbarAction extends ToolbarActionBase {
  group: "draw";
  tool: Extract<DrawTool, "wall" | "wall-brush" | "wall-erase" | "room">;
}

export type ToolbarAction = DeviceToolbarAction | DrawToolbarAction;

export const toolbarActions: Array<ToolbarAction> = [
  {
    group: "draw",
    id: "wall",
    tool: "wall",
    label: "Mur",
    shortcut: "tool-wall",
    title: "Tracer mur",
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
    group: "draw",
    id: "room",
    tool: "room",
    label: "Salle",
    shortcut: "tool-room",
    title: "Tracer salle",
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
    group: "draw",
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
    group: "draw",
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
  ...deviceKinds.map((kind): DeviceToolbarAction => {
    return {
      group: "device",
      id: kind.toolbar.id,
      type: kind.type,
      label: kind.toolbar.label,
      shortcut: kind.toolbar.shortcut,
      title: kind.toolbar.title,
      icon: kind.toolbar.icon,
    };
  }),
];

export const drawToolbarActions = toolbarActions.filter(
  (action): action is DrawToolbarAction => action.group === "draw",
);

export const deviceToolbarActions = toolbarActions.filter(
  (action): action is DeviceToolbarAction => action.group === "device",
);
