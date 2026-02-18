import { useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { nodeTypes } from "./nodeTypes";
import type { Node, OnNodesChange } from "@xyflow/react";
import type { Device, Position, Size } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { useHotkeyDirect, useShortcut } from "@/hooks/use-shortcuts";
import { GRID_SIZE } from "@/lib/walls";
import { useWallToolsController } from "@/walls/useWallToolsController";
import { cn } from "@/lib/utils";
import { WallOverlay } from "@/canvas/components/WallOverlay";
import { CanvasZoomControls } from "@/canvas/components/CanvasZoomControls";
import { WallToolHelpCard } from "@/canvas/components/WallToolHelpCard";
import { WallDebugPanel } from "@/canvas/components/WallDebugPanel";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];

type DeviceNode = Node<{ data: Device }>;

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

export default function FlowCanvas() {
  const devices = useMapStore((s) => s.devices);
  const walls = useMapStore((s) => s.walls);
  const currentFloorId = useMapStore((s) => s.currentFloorId);
  const selectedDeviceId = useMapStore((s) => s.selectedDeviceId);
  const hoveredDeviceId = useMapStore((s) => s.hoveredDeviceId);
  const isEditMode = useMapStore((s) => s.isEditMode);
  const highlightedDeviceIds = useMapStore((s) => s.highlightedDeviceIds);
  const activeDrawTool = useMapStore((s) => s.activeDrawTool);

  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);
  const setHighlightedDevices = useMapStore((s) => s.setHighlightedDevices);
  const updateDevicePosition = useMapStore((s) => s.updateDevicePosition);
  const checkCollision = useMapStore((s) => s.checkCollision);
  const reactFlow = useReactFlow();

  const wallTools = useWallToolsController();

  const lastValidPositions = useRef<Map<string, Position>>(new Map());
  const lastGridCell = useRef<Map<string, string>>(new Map());
  const [isCursorDragging, setIsCursorDragging] = useState(false);
  const [isWallDebugVisible, setIsWallDebugVisible] = useState(false);

  const canEditDevices = isEditMode && activeDrawTool === "device";

  useShortcut("zoom-in", () => {
    reactFlow.zoomIn({ duration: 200 });
  });

  useShortcut("zoom-out", () => {
    reactFlow.zoomOut({ duration: 200 });
  });

  useShortcut("zoom-reset", () => {
    reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  });

  const floorWalls = walls.filter((wall) => wall.floorId === currentFloorId);

  const [nodes, setNodes, onNodesChange] = useNodesState<DeviceNode>([]);

  useEffect(() => {
    const selectedId = useMapStore.getState().selectedDeviceId;
    const nextNodes = devices.reduce<Array<DeviceNode>>((acc, device) => {
      if (device.floorId !== currentFloorId) {
        return acc;
      }

      acc.push({
        id: device.id,
        type: device.type,
        position: device.position,
        data: { data: device },
        selected: device.id === selectedId,
        draggable: canEditDevices,
      });

      return acc;
    }, []);

    nextNodes.forEach((node) => {
      lastValidPositions.current.set(node.id, node.position);
    });

    setNodes(nextNodes);
  }, [devices, currentFloorId, canEditDevices, setNodes]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((node) => {
        const shouldBeSelected = node.id === selectedDeviceId;
        return node.selected === shouldBeSelected
          ? node
          : { ...node, selected: shouldBeSelected };
      }),
    );
  }, [selectedDeviceId, setNodes]);

  useHotkeyDirect("escape", wallTools.cancelTool, {
    scope: "canvas",
    enabled: isEditMode && activeDrawTool !== "device",
  });

  useHotkeyDirect(
    "shift+d",
    () => {
      setIsWallDebugVisible((prev) => !prev);
    },
    {
      scope: "canvas",
      enabled: isEditMode,
    },
  );

  const handleNodesChange: OnNodesChange<DeviceNode> = (changes) => {
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

          const device = devices.find((d) => d.id === change.id);
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
        if (change.type === "position" && change.position && !change.dragging) {
          updateDevicePosition(change.id, change.position);
        }
      });
    }
  };

  const handleNodeClick = (_: React.MouseEvent, node: DeviceNode) => {
    if (activeDrawTool !== "device") {
      return;
    }

    selectDevice(node.id);
  };

  const handleNodeMouseEnter = (_: React.MouseEvent, node: DeviceNode) => {
    setHoveredDevice(node.id);
  };

  const handleNodeMouseLeave = () => {
    setHoveredDevice(null);
  };

  const handleMoveStart = () => {
    setIsCursorDragging(true);
  };

  const handleMoveEnd = () => {
    setIsCursorDragging(false);
  };

  const handleNodeDragStart = () => {
    setIsCursorDragging(true);
  };

  const handleNodeDragStop = () => {
    setIsCursorDragging(false);
  };

  useEffect(() => {
    const handlePointerRelease = () => {
      setIsCursorDragging(false);
    };

    window.addEventListener("mouseup", handlePointerRelease);
    window.addEventListener("blur", handlePointerRelease);

    return () => {
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("blur", handlePointerRelease);
    };
  }, []);

  const handleHighlightHoveredConnections = () => {
    if (highlightedDeviceIds.length > 0 && !selectedDeviceId) {
      setHighlightedDevices([]);
      return;
    }

    const targetDeviceId = selectedDeviceId || hoveredDeviceId;
    if (!targetDeviceId) {
      return;
    }

    const device = devices.find((d) => d.id === targetDeviceId);
    if (!device?.metadata.connectedDeviceIds?.length) {
      return;
    }

    const connectedIds = device.metadata.connectedDeviceIds;
    const allIdsToHighlight = [targetDeviceId, ...connectedIds];
    const isCurrentlyHighlighted = allIdsToHighlight.every((id) =>
      highlightedDeviceIds.includes(id),
    );

    if (isCurrentlyHighlighted) {
      setHighlightedDevices([]);
    } else {
      setHighlightedDevices(allIdsToHighlight);
    }
  };

  useShortcut("highlight-connections", handleHighlightHoveredConnections, {
    enabled:
      (!!hoveredDeviceId || highlightedDeviceIds.length > 0) &&
      !selectedDeviceId,
  });

  const handlePaneMouseMove = (event: React.MouseEvent) => {
    wallTools.handlePaneMouseMove(event);
  };

  const handlePaneClick = (event: React.MouseEvent) => {
    if (!currentFloorId) {
      selectDevice(null);
      return;
    }

    if (!isEditMode) {
      selectDevice(null);
      return;
    }

    if (activeDrawTool === "device") {
      selectDevice(null);
      return;
    }

    selectDevice(null);
    wallTools.handlePaneClick(event);
  };

  const handlePaneContextMenu = (event: React.MouseEvent | MouseEvent) => {
    wallTools.handleContextMenu(event);
  };

  const handleNodeContextMenu = (event: React.MouseEvent) => {
    wallTools.handleContextMenu(event);
  };

  const handleZoomInClick = () => {
    reactFlow.zoomIn({ duration: 200 });
  };

  const handleZoomOutClick = () => {
    reactFlow.zoomOut({ duration: 200 });
  };

  const handleCenterViewportClick = () => {
    reactFlow.fitView({ padding: 0.2, duration: 250 });
  };

  const isWallDeleteTool = activeDrawTool === "wall-erase";
  const isWallDebugPanelVisible =
    isEditMode && activeDrawTool === "wall" && isWallDebugVisible;
  const wallHintPoint =
    activeDrawTool === "wall" && !wallTools.drawAnchor
      ? wallTools.hoverSnapPoint
      : null;
  const theoreticalWallStartPoint =
    activeDrawTool === "wall" ? wallTools.pointerSnapPoint : null;
  const realWallStartPoint =
    activeDrawTool === "wall" ? wallTools.lastWallStartPoint : null;
  const physicalWallStartPoint =
    activeDrawTool === "wall" ? wallTools.drawAnchor : null;

  const editModeHaloColor = isWallDeleteTool
    ? "inset 0 0 50px 20px rgba(239, 68, 68, 0.32)"
    : "inset 0 0 50px 20px rgba(46, 126, 255, 0.3)";
  const paneHoverFillColor = isWallDeleteTool
    ? "rgba(220, 38, 38, 0.22)"
    : "rgba(59, 130, 246, 0.16)";
  const paneHoverStrokeColor = isWallDeleteTool
    ? "rgba(220, 38, 38, 0.9)"
    : "rgba(59, 130, 246, 0.85)";

  return (
    <div className="relative h-full w-full">
      <ReactFlow<DeviceNode>
        nodes={nodes}
        edges={[]}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeContextMenu={handleNodeContextMenu}
        onPaneClick={handlePaneClick}
        onPaneMouseMove={handlePaneMouseMove}
        onPaneContextMenu={handlePaneContextMenu}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={SNAP_GRID}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnDrag={activeDrawTool === "wall-erase" ? false : true}
        deleteKeyCode={null}
        nodesDraggable={canEditDevices}
        className={cn(
          wallTools.paneCursorClass,
          isCursorDragging && "canvas-cursor-grabbing",
        )}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={GRID_SIZE}
          size={1.5}
          color="#94a3b8"
        />

        <WallOverlay
          floorWalls={floorWalls}
          previewSegments={wallTools.previewSegments}
          erasePreviewKeys={wallTools.erasePreviewKeys}
          activeDrawTool={activeDrawTool}
          drawAnchor={wallTools.drawAnchor}
          hoverSnapPoint={wallTools.hoverSnapPoint}
          paneHoverFillColor={paneHoverFillColor}
          paneHoverStrokeColor={paneHoverStrokeColor}
        />
      </ReactFlow>

      <CanvasZoomControls
        onZoomIn={handleZoomInClick}
        onZoomOut={handleZoomOutClick}
        onCenterViewport={handleCenterViewportClick}
      />

      <WallToolHelpCard
        isVisible={isEditMode && activeDrawTool !== "device"}
        drawMessage={wallTools.drawMessage}
      />

      <WallDebugPanel
        isVisible={isWallDebugPanelVisible}
        pointerPosition={wallTools.pointerPosition}
        wallHintPoint={wallHintPoint}
        theoreticalWallStartPoint={theoreticalWallStartPoint}
        realWallStartPoint={realWallStartPoint}
        physicalWallStartPoint={physicalWallStartPoint}
      />

      <div
        className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${
          isEditMode ? "opacity-100" : "opacity-0"
        }`}
        style={{
          boxShadow: editModeHaloColor,
        }}
      />
    </div>
  );
}
