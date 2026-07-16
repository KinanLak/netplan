import type { Node, NodeTypes } from "@xyflow/react";
import {
  createDeviceKindRecord,
  deviceKindRegistry,
} from "@/devices/deviceKindRegistry";
import type { Device, DeviceId, FloorId } from "@/types/map";

export type DeviceNodeData = Device & Record<string, unknown>;
export type DeviceNode = Node<DeviceNodeData>;

interface DeviceNodeInput {
  device: Device;
  selectedDeviceId: DeviceId | null;
  selectedDeviceIdSet?: ReadonlySet<DeviceId>;
  canEditDevices: boolean;
}

export const deviceNodeTypes: NodeTypes = createDeviceKindRecord(
  (type) => deviceKindRegistry[type].nodeAdapter,
);

export const toDeviceNode = ({
  device,
  selectedDeviceId,
  selectedDeviceIdSet,
  canEditDevices,
}: DeviceNodeInput): DeviceNode => {
  return {
    id: device.id,
    type: device.type,
    position: device.position,
    data: device as DeviceNodeData,
    selected:
      device.id === selectedDeviceId ||
      Boolean(selectedDeviceIdSet?.has(device.id)),
    draggable: canEditDevices,
  };
};

export const toDeviceNodes = (
  devices: Array<Device>,
  currentFloorId: FloorId | null,
  selectedDeviceId: DeviceId | null,
  canEditDevices: boolean,
  selectedDeviceIdSet?: ReadonlySet<DeviceId>,
): Array<DeviceNode> => {
  return devices.reduce<Array<DeviceNode>>((acc, device) => {
    if (device.floorId !== currentFloorId) {
      return acc;
    }

    acc.push(
      toDeviceNode({
        device,
        selectedDeviceId,
        selectedDeviceIdSet,
        canEditDevices,
      }),
    );
    return acc;
  }, []);
};
