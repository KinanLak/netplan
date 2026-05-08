import { describe, expect, it } from "bun:test";
import type { Device } from "@/types/map";
import {
  deviceNodeTypes,
  toDeviceNode,
  toDeviceNodes,
} from "./reactFlowDeviceAdapter";
import { deviceTypes } from "./deviceKindRegistry";

const createDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "device-1",
  type: "pc",
  name: "PC 1",
  floorId: "floor-a",
  position: { x: 80, y: 120 },
  size: { width: 80, height: 80 },
  metadata: {},
  ...overrides,
});

describe("react flow device adapter", () => {
  it("nests the Device under data.data so the React Flow shape stays distinct", () => {
    const device = createDevice();
    const node = toDeviceNode({
      device,
      selectedDeviceId: null,
      canEditDevices: true,
    });

    expect(node.data).toEqual({ data: device });
    expect(node.data.data).toBe(device);
    expect("selected" in node.data).toBe(false);
  });

  it("forwards canEditDevices to draggable so view mode locks nodes", () => {
    const device = createDevice();

    expect(
      toDeviceNode({ device, selectedDeviceId: null, canEditDevices: false })
        .draggable,
    ).toBe(false);
    expect(
      toDeviceNode({ device, selectedDeviceId: null, canEditDevices: true })
        .draggable,
    ).toBe(true);
  });

  it("flags only the matching device as selected", () => {
    const device = createDevice();

    expect(
      toDeviceNode({
        device,
        selectedDeviceId: device.id,
        canEditDevices: true,
      }).selected,
    ).toBe(true);
    expect(
      toDeviceNode({
        device,
        selectedDeviceId: "other-device",
        canEditDevices: true,
      }).selected,
    ).toBe(false);
  });

  it("filters devices by current floor when adapting the collection", () => {
    const onFloor = createDevice({ id: "device-1", floorId: "floor-a" });
    const onAnotherFloor = createDevice({ id: "device-2", floorId: "floor-b" });

    const nodes = toDeviceNodes(
      [onFloor, onAnotherFloor],
      "floor-a",
      null,
      true,
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("device-1");
  });

  it("returns no nodes when the current floor is null", () => {
    const device = createDevice();
    expect(toDeviceNodes([device], null, null, true)).toEqual([]);
  });

  it("registers a node adapter for every device type", () => {
    deviceTypes.forEach((type) => {
      expect(deviceNodeTypes[type]).toBeDefined();
    });
  });
});
