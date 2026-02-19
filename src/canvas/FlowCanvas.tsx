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
import {
  FLOW_CANVAS_BACKGROUND_COLOR,
  FLOW_CANVAS_BACKGROUND_DOT_SIZE,
  FLOW_CANVAS_CENTER_DURATION_MS,
  FLOW_CANVAS_FIT_VIEW_PADDING,
  FLOW_CANVAS_HALO_SHADOWS,
  FLOW_CANVAS_MAX_ZOOM,
  FLOW_CANVAS_MIN_ZOOM,
  FLOW_CANVAS_PANE_HOVER_COLORS,
  FLOW_CANVAS_RESET_DURATION_MS,
  FLOW_CANVAS_TOGGLE_DEBUG_HOTKEY,
  FLOW_CANVAS_ZOOM_DURATION_MS,
} from "@/lib/constants";

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
    reactFlow.zoomIn({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  });

  useShortcut("zoom-out", () => {
    reactFlow.zoomOut({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  });

  useShortcut("zoom-reset", () => {
    reactFlow.setViewport(
      { x: 0, y: 0, zoom: 1 },
      { duration: FLOW_CANVAS_RESET_DURATION_MS },
    );
  });

  useHotkeyDirect("escape", wallTools.cancelTool, {
    scope: "canvas",
    enabled: isEditMode && activeDrawTool !== "device",
  });

  useHotkeyDirect(
    FLOW_CANVAS_TOGGLE_DEBUG_HOTKEY,
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
    reactFlow.zoomIn({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  };

  const handleZoomOutClick = () => {
    reactFlow.zoomOut({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  };

  const handleCenterViewportClick = () => {
    reactFlow.fitView({
      padding: FLOW_CANVAS_FIT_VIEW_PADDING,
      duration: FLOW_CANVAS_CENTER_DURATION_MS,
    });
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
    ? FLOW_CANVAS_HALO_SHADOWS.erase
    : FLOW_CANVAS_HALO_SHADOWS.draw;
  const paneHoverFillColor = isWallDeleteTool
    ? FLOW_CANVAS_PANE_HOVER_COLORS.erase.fill
    : FLOW_CANVAS_PANE_HOVER_COLORS.draw.fill;
  const paneHoverStrokeColor = isWallDeleteTool
    ? FLOW_CANVAS_PANE_HOVER_COLORS.erase.stroke
    : FLOW_CANVAS_PANE_HOVER_COLORS.draw.stroke;
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
        fitViewOptions={{ padding: FLOW_CANVAS_FIT_VIEW_PADDING }}
        minZoom={FLOW_CANVAS_MIN_ZOOM}
        maxZoom={FLOW_CANVAS_MAX_ZOOM}
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
          size={FLOW_CANVAS_BACKGROUND_DOT_SIZE}
          color={FLOW_CANVAS_BACKGROUND_COLOR}
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
