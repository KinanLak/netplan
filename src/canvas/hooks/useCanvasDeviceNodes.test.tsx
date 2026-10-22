import { describe, expect, it, mock } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCanvasDeviceNodes } from "./useCanvasDeviceNodes";
import type { NodeChange } from "@xyflow/react";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";
import type { Device, DeviceId, FloorId, Position, Size } from "@/types/map";

const floorId = "floor-a" as FloorId;
const deviceId = "device-a" as DeviceId;

const device: Device = {
  id: deviceId,
  type: "pc",
  name: "PC A",
  floorId,
  position: { x: 0, y: 0 },
  size: { width: 80, height: 80 },
  macs: [],
  metadata: {},
};

describe("useCanvasDeviceNodes", () => {
  it("preserves an in-flight drag position when node metadata resyncs", async () => {
    const updateDevicePosition = mock(() => {});
    const { result, rerender } = renderHook(
      ({ devices }: { devices: Array<Device> }) =>
        useCanvasDeviceNodes({
          devices,
          ports: [],
          currentFloorId: floorId,
          selectedDeviceId: null,
          selectedDeviceIdSet: new Set(),
          isMultiSelectMode: false,
          activeDrawTool: "device",
          canEditDevices: true,
          checkCollision: () => false,
          updateDevicePosition,
          updateDevicePositions: () => {},
          selectDevice: () => {},
          setSelectedDevices: () => {},
          setHoveredDevice: () => {},
        }),
      { initialProps: { devices: [device] } },
    );

    await waitFor(() => expect(result.current.nodes).toHaveLength(1));

    const dragChange: NodeChange<DeviceNode> = {
      id: deviceId,
      type: "position",
      position: { x: 40, y: 0 },
      dragging: true,
    };

    act(() => {
      result.current.handleNodesChange([dragChange]);
    });

    expect(result.current.nodes[0].position).toEqual({ x: 40, y: 0 });

    rerender({ devices: [{ ...device, name: "PC A updated" }] });

    await waitFor(() =>
      expect(result.current.nodes[0].position).toEqual({ x: 40, y: 0 }),
    );
    expect(result.current.nodes[0].data.position).toEqual({ x: 40, y: 0 });
    expect(updateDevicePosition.mock.calls.length).toBe(0);
  });

  it("ignores selected devices for collisions only when the dragged one moves with them", async () => {
    const single = new Set(["device-b" as DeviceId]);
    const othersOnly = new Set(["device-b", "device-c"] as Array<DeviceId>);
    const selectedDeviceIds = new Set([
      "device-a",
      "device-c",
    ] as Array<DeviceId>);
    const checkCollision = mock(
      (
        _floorId: FloorId,
        _draggedDeviceId: DeviceId,
        _position: Position,
        _size: Size,
        _ignoredDeviceIds?: ReadonlySet<DeviceId>,
      ) => false,
    );
    const { result, rerender } = renderHook(
      ({ selection }: { selection: ReadonlySet<DeviceId> }) =>
        useCanvasDeviceNodes({
          devices: [device],
          ports: [],
          currentFloorId: floorId,
          selectedDeviceId: null,
          selectedDeviceIdSet: selection,
          isMultiSelectMode: false,
          activeDrawTool: "device",
          canEditDevices: true,
          checkCollision,
          updateDevicePosition: () => {},
          updateDevicePositions: () => {},
          selectDevice: () => {},
          setSelectedDevices: () => {},
          setHoveredDevice: () => {},
        }),
      { initialProps: { selection: single } },
    );
    await waitFor(() => expect(result.current.nodes).toHaveLength(1));

    act(() => {
      result.current.handleNodesChange([
        {
          id: deviceId,
          type: "position",
          position: { x: 40, y: 0 },
          dragging: true,
        },
      ]);
    });
    expect(checkCollision.mock.calls.at(-1)?.[4]).toBeUndefined();

    // Dragging a device outside the selected group: the group still blocks.
    rerender({ selection: othersOnly });
    act(() => {
      result.current.handleNodesChange([
        {
          id: deviceId,
          type: "position",
          position: { x: 60, y: 0 },
          dragging: true,
        },
      ]);
    });
    expect(checkCollision.mock.calls.at(-1)?.[4]).toBeUndefined();

    rerender({ selection: selectedDeviceIds });
    act(() => {
      result.current.handleNodesChange([
        {
          id: deviceId,
          type: "position",
          position: { x: 80, y: 0 },
          dragging: true,
        },
      ]);
    });
    expect(checkCollision.mock.calls.at(-1)?.[4]).toBe(selectedDeviceIds);
  });
});
