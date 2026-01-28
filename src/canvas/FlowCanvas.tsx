import { useCallback, useMemo, useRef } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useNodesState,
} from "@xyflow/react";
import { nodeTypes } from "./nodeTypes";
import type { Node, OnNodesChange } from "@xyflow/react";
import type { DeviceNodeData, Position, Size } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";

const SNAP_GRID: [number, number] = [20, 20];
const GRID_SIZE = 20;

type DeviceNode = Node<{ data: DeviceNodeData }>;

// Find the nearest valid position when there's a collision
const findNearestValidPosition = (
  deviceId: string,
  targetPos: Position,
  size: Size,
  lastValidPos: Position,
  checkCollision: (id: string, pos: Position, size: Size) => boolean,
): Position => {
  // If no collision at target, return target
  if (!checkCollision(deviceId, targetPos, size)) {
    return targetPos;
  }

  // Search in expanding circles for nearest valid position
  const maxRadius = 200; // Max search radius
  for (let radius = GRID_SIZE; radius <= maxRadius; radius += GRID_SIZE) {
    // Check positions in a circle pattern around the target
    const positions: Array<Position> = [];
    for (let dx = -radius; dx <= radius; dx += GRID_SIZE) {
      for (let dy = -radius; dy <= radius; dy += GRID_SIZE) {
        // Only check positions at approximately this radius
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= radius - GRID_SIZE && dist < radius + GRID_SIZE) {
          positions.push({
            x: Math.round((targetPos.x + dx) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((targetPos.y + dy) / GRID_SIZE) * GRID_SIZE,
          });
        }
      }
    }

    // Sort by distance to target position
    positions.sort((a, b) => {
      const distA = Math.abs(a.x - targetPos.x) + Math.abs(a.y - targetPos.y);
      const distB = Math.abs(b.x - targetPos.x) + Math.abs(b.y - targetPos.y);
      return distA - distB;
    });

    // Find first valid position
    for (const pos of positions) {
      if (!checkCollision(deviceId, pos, size)) {
        return pos;
      }
    }
  }

  // No valid position found, return last valid
  return lastValidPos;
};

export default function FlowCanvas() {
  const {
    devices,
    currentFloorId,
    selectedDeviceId,
    selectDevice,
    updateDevicePosition,
    isEditMode,
    highlightedDeviceIds,
    checkCollision,
  } = useMapStore();

  // Store last valid positions and last grid cell for optimization
  const lastValidPositions = useRef<Map<string, Position>>(new Map());
  const lastGridCell = useRef<Map<string, string>>(new Map());

  // Filter devices for current floor and convert to React Flow nodes
  const initialNodes = useMemo((): Array<DeviceNode> => {
    const nodes = devices
      .filter((d) => d.floorId === currentFloorId)
      .map(
        (device): DeviceNode => ({
          id: device.id,
          type: device.type,
          position: device.position,
          data: {
            data: {
              ...device,
              selected: device.id === selectedDeviceId,
              highlighted: highlightedDeviceIds.includes(device.id),
            },
          },
          selected: device.id === selectedDeviceId,
          draggable: isEditMode,
        }),
      );

    // Update last valid positions
    nodes.forEach((node) => {
      lastValidPositions.current.set(node.id, node.position);
    });

    return nodes;
  }, [
    devices,
    currentFloorId,
    selectedDeviceId,
    isEditMode,
    highlightedDeviceIds,
  ]);

  const [nodes, setNodes, onNodesChange] =
    useNodesState<DeviceNode>(initialNodes);

  // Sync nodes when floor changes or devices update
  useMemo(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  // Handle node changes (drag, select, etc.)
  const handleNodesChange: OnNodesChange<DeviceNode> = useCallback(
    (changes) => {
      // Process changes and check for collisions during drag
      const processedChanges = changes.map((change) => {
        if (change.type === "position" && change.position && change.dragging) {
          // Snap position to grid
          const snappedPosition = {
            x: Math.round(change.position.x / GRID_SIZE) * GRID_SIZE,
            y: Math.round(change.position.y / GRID_SIZE) * GRID_SIZE,
          };

          // Check if we moved to a new grid cell (optimization)
          const currentCell = `${Math.floor(snappedPosition.x / GRID_SIZE)},${Math.floor(snappedPosition.y / GRID_SIZE)}`;
          const prevCell = lastGridCell.current.get(change.id);

          // Only recalculate if grid cell changed
          if (currentCell !== prevCell) {
            lastGridCell.current.set(change.id, currentCell);

            // Find the device being dragged
            const device = devices.find((d) => d.id === change.id);
            if (device) {
              const lastValid =
                lastValidPositions.current.get(change.id) ?? device.position;

              // Find nearest valid position
              const validPosition = findNearestValidPosition(
                change.id,
                snappedPosition,
                device.size,
                lastValid,
                checkCollision,
              );

              // Update last valid position
              lastValidPositions.current.set(change.id, validPosition);

              return {
                ...change,
                position: validPosition,
              };
            }
          } else {
            // Same cell, use last valid position
            const lastValid = lastValidPositions.current.get(change.id);
            if (lastValid) {
              return {
                ...change,
                position: lastValid,
              };
            }
          }
        }
        return change;
      });

      onNodesChange(processedChanges);

      // Update positions in store after drag ends (only in edit mode)
      if (isEditMode) {
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
    [onNodesChange, updateDevicePosition, isEditMode, devices, checkCollision],
  );

  // Handle node click
  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: DeviceNode) => {
      selectDevice(node.id);
    },
    [selectDevice],
  );

  // Handle pane click (deselect)
  const handlePaneClick = useCallback(() => {
    selectDevice(null);
  }, [selectDevice]);

  return (
    <ReactFlow<DeviceNode>
      nodes={nodes}
      edges={[]}
      onNodesChange={handleNodesChange}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      snapToGrid={true}
      snapGrid={SNAP_GRID}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.1}
      maxZoom={2}
      deleteKeyCode={null}
      nodesDraggable={isEditMode}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1.5}
        color="#94a3b8"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
