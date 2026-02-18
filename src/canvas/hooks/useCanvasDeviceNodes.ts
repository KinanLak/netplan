import { useCallback, useEffect, useRef } from "react";
import { useNodesState } from "@xyflow/react";
import type { Node, OnNodesChange } from "@xyflow/react";
import type { Device, DrawTool, Position, Size } from "@/types/map";
import { GRID_SIZE } from "@/lib/walls";

type DeviceNode = Node<{ data: Device }>;

interface UseCanvasDeviceNodesParams {
  devices: Array<Device>;
  currentFloorId: string | null;
  selectedDeviceId: string | null;
  activeDrawTool: DrawTool;
  canEditDevices: boolean;
  checkCollision: (deviceId: string, position: Position, size: Size) => boolean;
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

const findNearestValidPosition = (
  deviceId: string,
  targetPos: Position,
  size: Size,
  lastValidPos: Position,
  checkCollision: (id: string, pos: Position, size: Size) => boolean,
): Position => {
  if (!checkCollision(deviceId, targetPos, size)) {
    return targetPos;
  }

  const maxRadius = 200;
  for (let radius = GRID_SIZE; radius <= maxRadius; radius += GRID_SIZE) {
    const positions: Array<Position> = [];
    for (let dx = -radius; dx <= radius; dx += GRID_SIZE) {
      for (let dy = -radius; dy <= radius; dy += GRID_SIZE) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= radius - GRID_SIZE && dist < radius + GRID_SIZE) {
          positions.push({
            x: Math.round((targetPos.x + dx) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((targetPos.y + dy) / GRID_SIZE) * GRID_SIZE,
          });
        }
      }
    }

    positions.sort((a, b) => {
      const distA = Math.abs(a.x - targetPos.x) + Math.abs(a.y - targetPos.y);
      const distB = Math.abs(b.x - targetPos.x) + Math.abs(b.y - targetPos.y);
      return distA - distB;
    });

    for (const pos of positions) {
      if (!checkCollision(deviceId, pos, size)) {
        return pos;
      }
    }
  }

  return lastValidPos;
};

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
  const lastValidPositions = useRef<Map<string, Position>>(new Map());
  const lastGridCell = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const nextNodes = devices.reduce<Array<DeviceNode>>((acc, device) => {
      if (device.floorId !== currentFloorId) {
        return acc;
      }

      acc.push({
        id: device.id,
        type: device.type,
        position: device.position,
        data: { data: device },
        selected: device.id === selectedDeviceId,
        draggable: canEditDevices,
      });

      return acc;
    }, []);

    nextNodes.forEach((node) => {
      lastValidPositions.current.set(node.id, node.position);
    });

    setNodes(nextNodes);
  }, [devices, currentFloorId, selectedDeviceId, canEditDevices, setNodes]);

  const handleNodesChange: OnNodesChange<DeviceNode> = useCallback(
    (changes) => {
      const processedChanges = changes.map((change) => {
        if (change.type === "position" && change.position && change.dragging) {
          const snappedPosition = {
            x: Math.round(change.position.x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(change.position.y / GRID_SIZE) * GRID_SIZE,
          };

          const currentCell = `${Math.floor(snappedPosition.x / GRID_SIZE)},${Math.floor(snappedPosition.y / GRID_SIZE)}`;
          const previousCell = lastGridCell.current.get(change.id);

          if (currentCell !== previousCell) {
            lastGridCell.current.set(change.id, currentCell);

            const device = devices.find(
              (candidate) => candidate.id === change.id,
            );
            if (device) {
              const lastValid =
                lastValidPositions.current.get(change.id) ?? device.position;

              const validPosition = findNearestValidPosition(
                change.id,
                snappedPosition,
                device.size,
                lastValid,
                checkCollision,
              );

              lastValidPositions.current.set(change.id, validPosition);

              return {
                ...change,
                position: validPosition,
              };
            }
          } else {
            const lastValid = lastValidPositions.current.get(change.id);
            if (lastValid) {
              return {
                ...change,
                position: lastValid,
              };
            }
          }
        }

        if (change.type === "position" && change.position && !change.dragging) {
          const lastValid = lastValidPositions.current.get(change.id);
          if (lastValid) {
            return {
              ...change,
              position: lastValid,
            };
          }
        }

        return change;
      });

      onNodesChange(processedChanges);

      if (canEditDevices) {
        processedChanges.forEach((change) => {
          if (
            change.type === "position" &&
            change.position &&
            !change.dragging
          ) {
            updateDevicePosition(change.id, change.position);
          }
        });
      }
    },
    [
      canEditDevices,
      checkCollision,
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
