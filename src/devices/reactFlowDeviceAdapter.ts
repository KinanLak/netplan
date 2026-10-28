import type { Node, NodeTypes } from "@xyflow/react";
import {
  createDeviceKindRecord,
  deviceKindRegistry,
} from "@/devices/deviceKindRegistry";
import { isAbsentFromSource } from "@/devices/identity";
import type { Device, DeviceId, FloorId, Port } from "@/types/map";

/** A device as its node draws it, with its ports in display order. */
export type DeviceNodeData = Device & {
  ports: ReadonlyArray<Port>;
} & Record<string, unknown>;
export type DeviceNode = Node<DeviceNodeData>;

interface DeviceNodeInput {
  device: Device;
  ports?: ReadonlyArray<Port>;
  selectedDeviceId: DeviceId | null;
  selectedDeviceIdSet?: ReadonlySet<DeviceId>;
  canEditDevices: boolean;
}

export const deviceNodeTypes: NodeTypes = createDeviceKindRecord(
  (type) => deviceKindRegistry[type].nodeAdapter,
);

const NO_PORTS: ReadonlyArray<Port> = [];

// A device NetBox no longer returns reads as no longer linked, without
// covering its status (ADR 0034): the whole node, label included, greys.
export const ABSENT_NODE_CLASS = "opacity-70 grayscale";

export const toDeviceNode = ({
  device,
  ports = NO_PORTS,
  selectedDeviceId,
  selectedDeviceIdSet,
  canEditDevices,
}: DeviceNodeInput): DeviceNode => {
  return {
    id: device.id,
    type: device.type,
    position: device.position,
    data: { ...device, ports },
    selected:
      device.id === selectedDeviceId ||
      Boolean(selectedDeviceIdSet?.has(device.id)),
    draggable: canEditDevices,
    // Set even when absent, so a device NetBox returns again loses it.
    className: isAbsentFromSource(device.source)
      ? ABSENT_NODE_CLASS
      : undefined,
  };
};

export const toDeviceNodes = (
  devices: Array<Device>,
  currentFloorId: FloorId | null,
  selectedDeviceId: DeviceId | null,
  canEditDevices: boolean,
  selectedDeviceIdSet?: ReadonlySet<DeviceId>,
  portsByDevice?: ReadonlyMap<DeviceId, ReadonlyArray<Port>>,
): Array<DeviceNode> => {
  return devices.reduce<Array<DeviceNode>>((acc, device) => {
    if (device.floorId !== currentFloorId) {
      return acc;
    }

    acc.push(
      toDeviceNode({
        device,
        ports: portsByDevice?.get(device.id),
        selectedDeviceId,
        selectedDeviceIdSet,
        canEditDevices,
      }),
    );
    return acc;
  }, []);
};
