import type { NodeTypes } from "@xyflow/react";
import EndpointNode from "@/canvas/nodeTypes/EndpointNode";
import PatchPanelNode from "@/canvas/nodeTypes/PatchPanelNode";
import PcNode from "@/canvas/nodeTypes/PcNode";
import RackNode from "@/canvas/nodeTypes/RackNode";
import SwitchNode from "@/canvas/nodeTypes/SwitchNode";
import WallPortNode from "@/canvas/nodeTypes/WallPortNode";
import { DEFAULT_DEVICE_SIZES } from "./deviceSizes";
import type { DeviceType, Size } from "@/types/map";

type DeviceNodeAdapter = NonNullable<NodeTypes[string]>;

export interface DeviceKind<TType extends DeviceType = DeviceType> {
  type: TType;
  label: string;
  drawerLabel: string;
  defaultSize: Size;
  nodeAdapter: DeviceNodeAdapter;
}

export const deviceKindRegistry = {
  rack: {
    type: "rack",
    label: "Rack",
    drawerLabel: "Rack Serveur",
    defaultSize: DEFAULT_DEVICE_SIZES.rack,
    nodeAdapter: RackNode,
  },
  switch: {
    type: "switch",
    label: "Switch",
    drawerLabel: "Switch Réseau",
    defaultSize: DEFAULT_DEVICE_SIZES.switch,
    nodeAdapter: SwitchNode,
  },
  pc: {
    type: "pc",
    label: "PC",
    drawerLabel: "Poste de travail",
    defaultSize: DEFAULT_DEVICE_SIZES.pc,
    nodeAdapter: PcNode,
  },
  "wall-port": {
    type: "wall-port",
    label: "Prise",
    drawerLabel: "Prise murale",
    defaultSize: DEFAULT_DEVICE_SIZES["wall-port"],
    nodeAdapter: WallPortNode,
  },
  "patch-panel": {
    type: "patch-panel",
    label: "Panneau",
    drawerLabel: "Panneau de brassage",
    defaultSize: DEFAULT_DEVICE_SIZES["patch-panel"],
    nodeAdapter: PatchPanelNode,
  },
  endpoint: {
    type: "endpoint",
    label: "Terminal",
    drawerLabel: "Terminal",
    defaultSize: DEFAULT_DEVICE_SIZES.endpoint,
    nodeAdapter: EndpointNode,
  },
} satisfies { [TType in DeviceType]: DeviceKind<TType> };

export const deviceTypes = Object.keys(deviceKindRegistry) as Array<DeviceType>;

export const deviceKinds = deviceTypes.map((type) => deviceKindRegistry[type]);

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
