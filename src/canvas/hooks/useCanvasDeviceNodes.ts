import { useCallback, useEffect } from "react";
import { useNodesState } from "@xyflow/react";
import type { OnNodesChange } from "@xyflow/react";
import type { Device, DrawTool, Position, Size } from "@/types/map";
import { useDevicePlacement } from "@/devices/useDevicePlacement";
import { toDeviceNodes } from "@/devices/reactFlowDeviceAdapter";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";

interface UseCanvasDeviceNodesParams {
  devices: Array<Device>;
  currentFloorId: string | null;
  selectedDeviceId: string | null;
  activeDrawTool: DrawTool;
  canEditDevices: boolean;
  checkCollision: (
    floorId: string,
    deviceId: string,
    position: Position,
    size: Size,
  ) => boolean;
  updateDevicePosition: (deviceId: string, position: Position) => void;
  selectDevice: (deviceId: string | null) => void;
  setHoveredDevice: (deviceId: string | null) => void;
}

interface UseCanvasDeviceNodesResult {
  nodes: Array<DeviceNode>;
  handleNodesChange: OnNodesChange<DeviceNode>;
  handleNodeClick: (_: React.MouseEvent, node: DeviceNode) => void;
  handleNodeMouseEnter: (_: React.MouseEvent, node: DeviceNode) => void;
  handleNodeMouseLeave: () => void;
}

export function useCanvasDeviceNodes({
  devices,
  currentFloorId,
  selectedDeviceId,
  activeDrawTool,
  canEditDevices,
  checkCollision,
  updateDevicePosition,
  selectDevice,
  setHoveredDevice,
}: UseCanvasDeviceNodesParams): UseCanvasDeviceNodesResult {
  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNode>([]);
  const devicePlacement = useDevicePlacement(checkCollision);

  useEffect(() => {
    const nextNodes = toDeviceNodes(
      devices,
      currentFloorId,
      selectedDeviceId,
      canEditDevices,
    );

    setNodes(nextNodes);
  }, [devices, currentFloorId, selectedDeviceId, canEditDevices, setNodes]);

  const handleNodesChange: OnNodesChange<DeviceNode> = useCallback(
    (changes) => {
      const committedPositions = new Map<string, Position>();
      const processedChanges = changes.map((change) => {
        if (change.type === "position" && change.position && change.dragging) {
          const device = devices.find(
            (candidate) => candidate.id === change.id,
          );
          if (device) {
            const result = devicePlacement.resolve({
              kind: "drag",
              deviceId: change.id,
              floorId: device.floorId,
              requestedPosition: change.position,
              size: device.size,
              startPosition: device.position,
            });

            if (result.ok) {
              return {
                ...change,
                position: result.position,
              };
            }
          }
        }

        if (change.type === "position" && change.position && !change.dragging) {
          const committedPosition = devicePlacement.commitDrag(change.id);
          if (committedPosition) {
            committedPositions.set(change.id, committedPosition);
            return {
              ...change,
              position: committedPosition,
            };
          }
        }

        return change;
      });

      onNodesChange(processedChanges);

      if (canEditDevices) {
        committedPositions.forEach((position, deviceId) => {
          updateDevicePosition(deviceId, position);
        });
      }
    },
    [
      canEditDevices,
      devicePlacement,
      devices,
      onNodesChange,
      updateDevicePosition,
    ],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      if (activeDrawTool !== "device") {
        return;
      }

      selectDevice(node.id);
    },
    [activeDrawTool, selectDevice],
  );

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      setHoveredDevice(node.id);
    },
    [setHoveredDevice],
  );

  const handleNodeMouseLeave = useCallback(() => {
    setHoveredDevice(null);
  }, [setHoveredDevice]);

  return {
    nodes,
    handleNodesChange,
    handleNodeClick,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
  };
}
