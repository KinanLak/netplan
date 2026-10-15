import type { NodeTypes } from "@xyflow/react";
import EndpointNode from "@/canvas/nodeTypes/EndpointNode";
import PatchPanelNode from "@/canvas/nodeTypes/PatchPanelNode";
import PcNode from "@/canvas/nodeTypes/PcNode";
import RackNode from "@/canvas/nodeTypes/RackNode";
import SwitchNode from "@/canvas/nodeTypes/SwitchNode";
import WallPortNode from "@/canvas/nodeTypes/WallPortNode";
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
    defaultSize: { width: 80, height: 160 },
    nodeAdapter: RackNode,
  },
  switch: {
    type: "switch",
    label: "Switch",
    drawerLabel: "Switch Réseau",
    defaultSize: { width: 200, height: 60 },
    nodeAdapter: SwitchNode,
  },
  pc: {
    type: "pc",
    label: "PC",
    drawerLabel: "Poste de travail",
    defaultSize: { width: 80, height: 80 },
    nodeAdapter: PcNode,
  },
  "wall-port": {
    type: "wall-port",
    label: "Prise",
    drawerLabel: "Prise murale",
    defaultSize: { width: 40, height: 40 },
    nodeAdapter: WallPortNode,
  },
  "patch-panel": {
    type: "patch-panel",
    label: "Panneau",
    drawerLabel: "Panneau de brassage",
    defaultSize: { width: 200, height: 40 },
    nodeAdapter: PatchPanelNode,
  },
  endpoint: {
    type: "endpoint",
    label: "Terminal",
    drawerLabel: "Terminal",
    defaultSize: { width: 80, height: 80 },
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
