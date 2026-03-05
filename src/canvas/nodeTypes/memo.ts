import type { Node, NodeProps } from "@xyflow/react";
import type { DeviceNodeData } from "@/types/map";

type DeviceNodeType = Node<DeviceNodeData>;

export const areDeviceNodePropsEqual = (
  previous: NodeProps<DeviceNodeType>,
  next: NodeProps<DeviceNodeType>,
): boolean => {
  return previous.id === next.id && previous.data === next.data;
};
