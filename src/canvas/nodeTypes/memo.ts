import type { Node, NodeProps } from "@xyflow/react";
import type { Device } from "@/types/map";

type DeviceNodeType = Node<{ data: Device }>;

export const areDeviceNodePropsEqual = (
  previous: NodeProps<DeviceNodeType>,
  next: NodeProps<DeviceNodeType>,
): boolean => {
  return previous.id === next.id && previous.data.data === next.data.data;
};
