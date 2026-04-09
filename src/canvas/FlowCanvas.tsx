import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { nodeTypes } from "./nodeTypes";
import type { Node } from "@xyflow/react";
import type { DeviceNodeData } from "@/types/map";
import type { WallToolsLayerHandle } from "@/canvas/components/WallToolsLayer";
import { useMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useDevices,
  useIsEditMode,
  useSelectedDeviceId,
  useWalls,
} from "@/store/selectors";
import { GRID_SIZE } from "@/lib/walls";
import { cn } from "@/lib/utils";
import { CanvasZoomControls } from "@/canvas/components/CanvasZoomControls";
import { WallToolsLayer } from "@/canvas/components/WallToolsLayer";
import { useCanvasDeviceNodes } from "@/canvas/hooks/useCanvasDeviceNodes";
import { useCanvasDragState } from "@/canvas/hooks/useCanvasDragState";
import { useCanvasKeyboardShortcuts } from "@/canvas/hooks/useCanvasKeyboardShortcuts";
import {
  FLOW_CANVAS_BACKGROUND_COLOR,
  FLOW_CANVAS_BACKGROUND_DOT_SIZE,
  FLOW_CANVAS_CENTER_DURATION_MS,
  FLOW_CANVAS_FIT_VIEW_PADDING,
  FLOW_CANVAS_HALO_SHADOWS,
  FLOW_CANVAS_MAX_ZOOM,
  FLOW_CANVAS_MIN_ZOOM,
  FLOW_CANVAS_PANE_HOVER_COLORS,
  FLOW_CANVAS_ZOOM_DURATION_MS,
} from "@/lib/constants";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];
const EMPTY_EDGES: Array<never> = [];

type DeviceNode = Node<DeviceNodeData>;

export default function FlowCanvas() {
  const devices = useDevices();
  const walls = useWalls();
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();

  const selectDevice = useMapUiStore((state) => state.selectDevice);
  const setHoveredDevice = useMapUiStore((state) => state.setHoveredDevice);
  const updateDevicePosition = useMapStore(
    (state) => state.updateDevicePosition,
  );
  const checkCollision = useMapStore((state) => state.checkCollision);
  const reactFlow = useReactFlow();
  const wallToolsControllerRef = useRef<WallToolsLayerHandle | null>(null);

  const [paneCursorClass, setPaneCursorClass] = useState(
    "canvas-cursor-default",
  );

  const canEditDevices = isEditMode && activeDrawTool === "device";
  const floorWalls = useMemo(
    () => walls.filter((wall) => wall.floorId === currentFloorId),
    [walls, currentFloorId],
  );

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

  const { isWallDebugVisible } = useCanvasKeyboardShortcuts({
    reactFlow,
    wallToolsControllerRef,
    isEditMode,
    activeDrawTool,
  });

  const isWallDebugPanelVisible =
    isEditMode && activeDrawTool === "wall" && isWallDebugVisible;

  const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
    wallToolsControllerRef.current?.handlePaneMouseMove(event);
  }, []);

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (!currentFloorId || !isEditMode || activeDrawTool === "device") {
        selectDevice(null);
        return;
      }

      selectDevice(null);
      wallToolsControllerRef.current?.handlePaneClick(event);
    },
    [activeDrawTool, currentFloorId, isEditMode, selectDevice],
  );

  const handlePaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      wallToolsControllerRef.current?.handleContextMenu(event);
    },
    [],
  );

  const handleNodeContextMenu = useCallback((event: React.MouseEvent) => {
    wallToolsControllerRef.current?.handleContextMenu(event);
  }, []);

  const handlePaneCursorClassChange = useCallback((nextCursorClass: string) => {
    setPaneCursorClass((currentCursorClass) =>
      currentCursorClass === nextCursorClass
        ? currentCursorClass
        : nextCursorClass,
    );
  }, []);

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

  const editModeHaloColor = isWallDeleteTool
    ? FLOW_CANVAS_HALO_SHADOWS.erase
    : FLOW_CANVAS_HALO_SHADOWS.draw;
  const paneHoverFillColor = isWallDeleteTool
    ? FLOW_CANVAS_PANE_HOVER_COLORS.erase.fill
    : FLOW_CANVAS_PANE_HOVER_COLORS.draw.fill;
  const paneHoverStrokeColor = isWallDeleteTool
    ? FLOW_CANVAS_PANE_HOVER_COLORS.erase.stroke
    : FLOW_CANVAS_PANE_HOVER_COLORS.draw.stroke;
  const [lastVisibleHaloColor, setLastVisibleHaloColor] =
    useState(editModeHaloColor);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    queueMicrotask(() => {
      setLastVisibleHaloColor(editModeHaloColor);
    });
  }, [editModeHaloColor, isEditMode]);

  const editModeHaloShadow = isEditMode
    ? editModeHaloColor
    : lastVisibleHaloColor;

  return (
    <div className="relative h-full w-full">
      <ReactFlow<DeviceNode>
        nodes={nodes}
        edges={EMPTY_EDGES}
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
        fitViewOptions={{ padding: FLOW_CANVAS_FIT_VIEW_PADDING }}
        minZoom={FLOW_CANVAS_MIN_ZOOM}
        maxZoom={FLOW_CANVAS_MAX_ZOOM}
        panOnDrag={isWallDeleteTool || isWallBrushTool ? false : true}
        deleteKeyCode={null}
        nodesDraggable={canEditDevices}
        className={cn(
          paneCursorClass,
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

        <WallToolsLayer
          controllerRef={wallToolsControllerRef}
          floorWalls={floorWalls}
          activeDrawTool={activeDrawTool}
          isEditMode={isEditMode}
          isWallDebugPanelVisible={isWallDebugPanelVisible}
          paneHoverFillColor={paneHoverFillColor}
          paneHoverStrokeColor={paneHoverStrokeColor}
          onPaneCursorClassChange={handlePaneCursorClassChange}
        />
      </ReactFlow>

      <CanvasZoomControls
        onZoomIn={handleZoomInClick}
        onZoomOut={handleZoomOutClick}
        onCenterViewport={handleCenterViewportClick}
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
