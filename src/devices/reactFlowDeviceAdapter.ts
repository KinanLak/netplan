import type { Node, NodeTypes } from "@xyflow/react";
import {
  createDeviceKindRecord,
  deviceKindRegistry,
} from "@/devices/deviceKindRegistry";
import type { Device, DeviceNodeData } from "@/types/map";

export type DeviceNode = Node<DeviceNodeData>;

interface DeviceNodeInput {
  device: Device;
  selectedDeviceId: string | null;
  canEditDevices: boolean;
}

export const deviceNodeTypes: NodeTypes = createDeviceKindRecord(
  (type) => deviceKindRegistry[type].nodeAdapter,
);

export const toDeviceNode = ({
  device,
  selectedDeviceId,
  canEditDevices,
}: DeviceNodeInput): DeviceNode => {
  return {
    id: device.id,
    type: device.type,
    position: device.position,
    data: { data: device },
    selected: device.id === selectedDeviceId,
    draggable: canEditDevices,
  };
};

export const toDeviceNodes = (
  devices: Array<Device>,
  currentFloorId: string | null,
  selectedDeviceId: string | null,
  canEditDevices: boolean,
): Array<DeviceNode> => {
  return devices.reduce<Array<DeviceNode>>((acc, device) => {
    if (device.floorId !== currentFloorId) {
      return acc;
    }

    acc.push(toDeviceNode({ device, selectedDeviceId, canEditDevices }));
    return acc;
  }, []);
};
