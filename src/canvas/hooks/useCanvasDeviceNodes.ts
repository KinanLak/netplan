import { useCallback, useEffect } from "react";
import { useNodesState } from "@xyflow/react";
import type { OnNodesChange } from "@xyflow/react";
import type {
  Device,
  DeviceId,
  DrawTool,
  FloorId,
  Position,
  Size,
} from "@/types/map";
import { useDevicePlacement } from "@/devices/useDevicePlacement";
import { toDeviceNodes } from "@/devices/reactFlowDeviceAdapter";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";

interface UseCanvasDeviceNodesParams {
  devices: Array<Device>;
  currentFloorId: FloorId | null;
  selectedDeviceId: DeviceId | null;
  activeDrawTool: DrawTool;
  canEditDevices: boolean;
  checkCollision: (
    floorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
  ) => boolean;
  updateDevicePosition: (deviceId: DeviceId, position: Position) => void;
  selectDevice: (deviceId: DeviceId | null) => void;
  setHoveredDevice: (deviceId: DeviceId | null) => void;
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
      const committedPositions = new Map<DeviceId, Position>();
      const processedChanges = changes.map((change) => {
        if (change.type === "position" && change.position && change.dragging) {
          const device = devices.find(
            (candidate) => candidate._id === change.id,
          );
          if (device) {
            const result = devicePlacement.resolve({
              kind: "drag",
              deviceId: change.id as DeviceId,
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
          const committedPosition = devicePlacement.commitDrag(
            change.id as DeviceId,
          );
          if (committedPosition) {
            committedPositions.set(change.id as DeviceId, committedPosition);
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

      selectDevice(node.id as DeviceId);
    },
    [activeDrawTool, selectDevice],
  );

  const handleNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      setHoveredDevice(node.id as DeviceId);
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
