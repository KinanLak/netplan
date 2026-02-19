import { useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { nodeTypes } from "./nodeTypes";
import type { Node } from "@xyflow/react";
import type { Device } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { useHotkeyDirect, useShortcut } from "@/hooks/use-shortcuts";
import { GRID_SIZE } from "@/lib/walls";
import { useWallToolsController } from "@/walls/useWallToolsController";
import { cn } from "@/lib/utils";
import { WallOverlay } from "@/canvas/components/WallOverlay";
import { CanvasZoomControls } from "@/canvas/components/CanvasZoomControls";
import { WallToolHelpCard } from "@/canvas/components/WallToolHelpCard";
import { WallDebugPanel } from "@/canvas/components/WallDebugPanel";
import { useCanvasDeviceNodes } from "@/canvas/hooks/useCanvasDeviceNodes";
import { useCanvasDragState } from "@/canvas/hooks/useCanvasDragState";
import { useConnectionHighlightShortcut } from "@/canvas/hooks/useConnectionHighlightShortcut";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];

type DeviceNode = Node<{ data: Device }>;

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

  const [isWallDebugVisible, setIsWallDebugVisible] = useState(false);

  const canEditDevices = isEditMode && activeDrawTool === "device";
  const floorWalls = walls.filter((wall) => wall.floorId === currentFloorId);

  const {
    nodes,
    handleNodesChange,
    handleNodeClick,
    handleNodeMouseEnter,
    handleNodeMouseLeave,
  } = useCanvasDeviceNodes({
    devices,
    currentFloorId,
    selectedDeviceId,
    activeDrawTool,
    canEditDevices,
    checkCollision,
    updateDevicePosition,
    selectDevice,
    setHoveredDevice,
  });

  const {
    isCursorDragging,
    handleMoveStart,
    handleMoveEnd,
    handleNodeDragStart,
    handleNodeDragStop,
  } = useCanvasDragState();

  useShortcut("zoom-in", () => {
    reactFlow.zoomIn({ duration: 200 });
  });

  useShortcut("zoom-out", () => {
    reactFlow.zoomOut({ duration: 200 });
  });

  useShortcut("zoom-reset", () => {
    reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 });
  });

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

  useConnectionHighlightShortcut({
    devices,
    highlightedDeviceIds,
    selectedDeviceId,
    hoveredDeviceId,
    setHighlightedDevices,
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
  const isWallBrushTool = activeDrawTool === "wall-brush";
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
  const haloContextKey = `${isEditMode}:${activeDrawTool}`;
  const [previousHaloContextKey, setPreviousHaloContextKey] =
    useState(haloContextKey);
  const [lastVisibleHaloColor, setLastVisibleHaloColor] =
    useState(editModeHaloColor);

  if (previousHaloContextKey !== haloContextKey) {
    setPreviousHaloContextKey(haloContextKey);
    if (isEditMode) {
      setLastVisibleHaloColor(editModeHaloColor);
    }
  }

  const editModeHaloShadow = isEditMode
    ? editModeHaloColor
    : lastVisibleHaloColor;

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
        // panOnScroll={true} // Allow moving on the canvas horizontally and vertically by using the trackpad naturally
        snapGrid={SNAP_GRID}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnDrag={isWallDeleteTool || isWallBrushTool ? false : true}
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
          boxShadow: editModeHaloShadow,
        }}
      />
    </div>
  );
}
