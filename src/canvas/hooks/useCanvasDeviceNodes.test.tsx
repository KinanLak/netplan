import { describe, expect, it, mock } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useCanvasDeviceNodes } from "./useCanvasDeviceNodes";
import type { NodeChange } from "@xyflow/react";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";
import type { Device, DeviceId, FloorId, Position } from "@/types/map";
import type { GroupMember } from "@/map-engine/types";

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
          moveDevices: () => true,
          canMoveDevices: () => true,
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

  it("drags a selection as one block, waiting where all its members fit", async () => {
    const other: Device = {
      ...device,
      id: "device-b" as DeviceId,
      name: "PC B",
      position: { x: 140, y: 100 },
    };
    const selection = new Set([device.id, other.id]);
    // A wall the group cannot reach past an offset of 40 to the right.
    const canMoveDevices = mock(
      (_from: ReadonlyArray<GroupMember>, offset: Position) => offset.x <= 40,
    );
    const moveDevices = mock(
      (_from: ReadonlyArray<GroupMember>, _offset: Position) => true,
    );
    const updateDevicePosition = mock(() => {});
    const { result } = renderHook(() =>
      useCanvasDeviceNodes({
        devices: [device, other],
        ports: [],
        currentFloorId: floorId,
        selectedDeviceId: null,
        selectedDeviceIdSet: selection,
        isMultiSelectMode: false,
        activeDrawTool: "device",
        canEditDevices: true,
        checkCollision: () => false,
        updateDevicePosition,
        moveDevices,
        canMoveDevices,
        selectDevice: () => {},
        setSelectedDevices: () => {},
        setHoveredDevice: () => {},
      }),
    );
    await waitFor(() => expect(result.current.nodes).toHaveLength(2));

    const drag = (dx: number, dragging: boolean) =>
      act(() => {
        result.current.handleNodesChange([
          {
            id: device.id,
            type: "position",
            position: { x: dx, y: 0 },
            dragging,
          },
          {
            id: other.id,
            type: "position",
            position: { x: 140 + dx, y: 100 },
            dragging,
          },
        ]);
      });
    const positions = () => result.current.nodes.map((node) => node.position);

    drag(20, true);
    expect(positions()).toEqual([
      { x: 20, y: 0 },
      { x: 160, y: 100 },
    ]);
    // Past the wall, both wait at the last offset where both fit: the group
    // keeps its shape, and each shows the spot it cannot take.
    drag(120, true);
    expect(positions()).toEqual([
      { x: 40, y: 0 },
      { x: 180, y: 100 },
    ]);
    expect(result.current.blockedSpots).toHaveLength(2);

    drag(120, false);
    // From where the drag found them, so a member moved meanwhile refuses
    // the move rather than bending the group.
    expect(moveDevices.mock.calls).toEqual([
      [
        [
          { deviceId: device.id, position: { x: 0, y: 0 } },
          { deviceId: other.id, position: { x: 140, y: 100 } },
        ],
        { x: 40, y: 0 },
      ],
    ]);
    expect(updateDevicePosition.mock.calls.length).toBe(0);
    expect(result.current.blockedSpots).toHaveLength(0);
  });
});
