import {
  ComputerIcon,
  HardDriveIcon,
  PlugSocketIcon,
  ServerStack03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RegisterableHotkey } from "@tanstack/react-hotkeys";
import type { NodeTypes } from "@xyflow/react";
import PcNode from "@/canvas/nodeTypes/PcNode";
import RackNode from "@/canvas/nodeTypes/RackNode";
import SwitchNode from "@/canvas/nodeTypes/SwitchNode";
import WallPortNode from "@/canvas/nodeTypes/WallPortNode";
import { TOOLBAR_ICON_SIZE_CLASS } from "@/lib/constants";
import type { DeviceType, Size } from "@/types/map";

export type DeviceToolShortcutAction = `tool-${DeviceType}`;

type DeviceNodeAdapter = NonNullable<NodeTypes[string]>;

export interface DeviceKind<TType extends DeviceType = DeviceType> {
  type: TType;
  label: string;
  drawerLabel: string;
  defaultSize: Size;
  toolbar: {
    id: TType;
    label: string;
    title: string;
    shortcut: DeviceToolShortcutAction;
    icon: React.ReactNode;
  };
  shortcut: {
    action: DeviceToolShortcutAction;
    keys: [RegisterableHotkey, ...Array<RegisterableHotkey>];
    label: string;
    description: string;
  };
  nodeAdapter: DeviceNodeAdapter;
}

const toolbarIcon = (icon: typeof ServerStack03Icon): React.ReactNode => (
  <HugeiconsIcon
    icon={icon}
    className={TOOLBAR_ICON_SIZE_CLASS}
    color="currentColor"
    strokeWidth={1.5}
  />
);

export const deviceKindRegistry = {
  rack: {
    type: "rack",
    label: "Rack",
    drawerLabel: "Rack Serveur",
    defaultSize: { width: 80, height: 160 },
    toolbar: {
      id: "rack",
      label: "Rack",
      title: "Ajouter Rack",
      shortcut: "tool-rack",
      icon: toolbarIcon(ServerStack03Icon),
    },
    shortcut: {
      action: "tool-rack",
      keys: ["5"],
      label: "Rack",
      description: "Ajouter un rack serveur",
    },
    nodeAdapter: RackNode,
  },
  switch: {
    type: "switch",
    label: "Switch",
    drawerLabel: "Switch Réseau",
    defaultSize: { width: 200, height: 60 },
    toolbar: {
      id: "switch",
      label: "Switch",
      title: "Ajouter Switch",
      shortcut: "tool-switch",
      icon: toolbarIcon(HardDriveIcon),
    },
    shortcut: {
      action: "tool-switch",
      keys: ["6"],
      label: "Switch",
      description: "Ajouter un switch réseau",
    },
    nodeAdapter: SwitchNode,
  },
  pc: {
    type: "pc",
    label: "PC",
    drawerLabel: "Poste de travail",
    defaultSize: { width: 80, height: 80 },
    toolbar: {
      id: "pc",
      label: "PC",
      title: "Ajouter PC",
      shortcut: "tool-pc",
      icon: toolbarIcon(ComputerIcon),
    },
    shortcut: {
      action: "tool-pc",
      keys: ["7"],
      label: "PC",
      description: "Ajouter un poste de travail",
    },
    nodeAdapter: PcNode,
  },
  "wall-port": {
    type: "wall-port",
    label: "Prise",
    drawerLabel: "Prise murale",
    defaultSize: { width: 40, height: 40 },
    toolbar: {
      id: "wall-port",
      label: "Prise",
      title: "Ajouter Prise",
      shortcut: "tool-wall-port",
      icon: toolbarIcon(PlugSocketIcon),
    },
    shortcut: {
      action: "tool-wall-port",
      keys: ["8"],
      label: "Prise",
      description: "Ajouter une prise murale",
    },
    nodeAdapter: WallPortNode,
  },
} satisfies { [TType in DeviceType]: DeviceKind<TType> };

export const deviceTypes = Object.keys(deviceKindRegistry) as Array<DeviceType>;

export const deviceKinds = deviceTypes.map((type) => deviceKindRegistry[type]);

export const deviceToolShortcutActions = deviceKinds.map(
  (kind) => kind.shortcut.action,
);

export const getDeviceKind = (type: DeviceType): DeviceKind => {
  return deviceKindRegistry[type];
};

export const getDeviceKindLabel = (type: DeviceType): string => {
  return deviceKindRegistry[type].drawerLabel;
};

export const createDeviceKindRecord = <TValue,>(
  buildValue: (type: DeviceType) => TValue,
): Record<DeviceType, TValue> => {
  return Object.fromEntries(
    deviceTypes.map((type) => [type, buildValue(type)]),
  ) as Record<DeviceType, TValue>;
};
