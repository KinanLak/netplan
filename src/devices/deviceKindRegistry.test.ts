import { describe, expect, it } from "bun:test";
import { availableDevicesCatalog } from "@/devices/deviceCatalog";
import {
  createDeviceKindRecord,
  deviceKindRegistry,
  deviceTypes,
  getDeviceKind,
  getDeviceKindLabel,
} from "./deviceKindRegistry";
import { deviceNodeTypes, toDeviceNode } from "./reactFlowDeviceAdapter";
import type { Device, DeviceId, DeviceType, FloorId } from "@/types/map";
import type { DeviceKind } from "./deviceKindRegistry";

const sorted = (values: Array<string>): Array<string> => values.toSorted();

describe("device kind registry", () => {
  it("registers every catalog device type at every device-kind seam", () => {
    const registryTypes = sorted(deviceTypes);
    const catalogTypes = sorted(Object.keys(availableDevicesCatalog));

    expect(registryTypes).toEqual(catalogTypes);
    expect(sorted(Object.keys(deviceNodeTypes))).toEqual(registryTypes);

    deviceTypes.forEach((type) => {
      const kind = deviceKindRegistry[type];

      expect(kind.type).toBe(type);
      expect(kind.label.length > 0).toBe(true);
      expect(kind.drawerLabel.length > 0).toBe(true);
      expect(deviceNodeTypes[type]).toBe(kind.nodeAdapter);
      expect(availableDevicesCatalog[type].length > 0).toBe(true);
      expect(
        availableDevicesCatalog[type].every((device) => device.type === type),
      ).toBe(true);
      expect(
        availableDevicesCatalog[type].some(
          (device) =>
            device.size.width === kind.defaultSize.width &&
            device.size.height === kind.defaultSize.height,
        ),
      ).toBe(true);
    });
  });

  it("adapts a Device into the React Flow node shape", () => {
    const device: Device = {
      id: "device-1" as DeviceId,
      type: "switch",
      name: "Switch 1",
      floorId: "floor-1" as FloorId,
      position: { x: 80, y: 120 },
      size: { width: 200, height: 60 },
      macs: [],
      metadata: { status: "up" },
    };

    const node = toDeviceNode({
      device,
      selectedDeviceId: device.id,
      canEditDevices: true,
    });

    expect(node.id).toBe(device.id);
    expect(node.type).toBe(device.type);
    expect(node.position).toBe(device.position);
    expect(node.selected).toBe(true);
    expect(node.draggable).toBe(true);
    expect(node.data).toBe(device);
  });

  it("exposes lookup helpers derived from the registry", () => {
    expect(getDeviceKind("pc")).toBe(deviceKindRegistry.pc);
    expect(getDeviceKindLabel("switch")).toBe(
      deviceKindRegistry.switch.drawerLabel,
    );
    expect(
      createDeviceKindRecord((type) => deviceKindRegistry[type].label),
    ).toEqual({
      pc: deviceKindRegistry.pc.label,
      rack: deviceKindRegistry.rack.label,
      switch: deviceKindRegistry.switch.label,
      "wall-port": deviceKindRegistry["wall-port"].label,
      "patch-panel": deviceKindRegistry["patch-panel"].label,
      endpoint: deviceKindRegistry.endpoint.label,
    });
  });
});

const registryCoversDeviceType: Record<DeviceType, DeviceKind> =
  deviceKindRegistry;
void registryCoversDeviceType;
