import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { nodeTypes } from "./nodeTypes";
import type { Node } from "@xyflow/react";
import type { Hotkey } from "@tanstack/react-hotkeys";
import type { Device } from "@/types/map";
import type { WallToolsLayerHandle } from "@/canvas/components/WallToolsLayer";
import { useMapStore } from "@/store/useMapStore";
import { useShortcut } from "@/hooks/use-shortcuts";
import { GRID_SIZE } from "@/lib/walls";
import { cn } from "@/lib/utils";
import { CanvasZoomControls } from "@/canvas/components/CanvasZoomControls";
import { WallToolsLayer } from "@/canvas/components/WallToolsLayer";
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
  PAN_AMOUNT,
} from "@/lib/constants";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];

type DeviceNode = Node<{ data: Device }>;

export default function FlowCanvas() {
  const devices = useMapStore((s) => s.devices);
  const walls = useMapStore((s) => s.walls);
  const currentFloorId = useMapStore((s) => s.currentFloorId);
  const selectedDeviceId = useMapStore((s) => s.selectedDeviceId);
  const isEditMode = useMapStore((s) => s.isEditMode);
  const activeDrawTool = useMapStore((s) => s.activeDrawTool);

  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);
  const updateDevicePosition = useMapStore((s) => s.updateDevicePosition);
  const checkCollision = useMapStore((s) => s.checkCollision);
  const reactFlow = useReactFlow();
  const wallToolsControllerRef = useRef<WallToolsLayerHandle | null>(null);

  const [isWallDebugVisible, setIsWallDebugVisible] = useState(false);
  const [paneCursorClass, setPaneCursorClass] = useState(
    "canvas-cursor-default",
  );

  const isWallDebugPanelVisible =
    isEditMode && activeDrawTool === "wall" && isWallDebugVisible;

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

  // Top-row zoom shortcuts go through TanStack (Ctrl/Cmd + = / - / 0)
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

  // Numpad zoom shortcuts via TanStack (code-gated to avoid top-row collisions)
  useHotkey(
    { key: "+" },
    (event) => {
      if (event.code !== "NumpadAdd") {
        return;
      }

      event.preventDefault();
      reactFlow.zoomIn({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
    },
    {
      conflictBehavior: "allow",
    },
  );

  useEffect(() => {
    const handleNumpadAddFallback = (event: KeyboardEvent) => {
      if (event.code !== "NumpadAdd") {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }

      event.preventDefault();
      reactFlow.zoomIn({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
    };

    window.addEventListener("keydown", handleNumpadAddFallback, true);
    return () => {
      window.removeEventListener("keydown", handleNumpadAddFallback, true);
    };
  }, [reactFlow]);

  useHotkey(
    { key: "-" },
    (event) => {
      if (event.code !== "NumpadSubtract") {
        return;
      }

      event.preventDefault();
      reactFlow.zoomOut({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
    },
    {
      conflictBehavior: "allow",
    },
  );

  useHotkey(
    { key: "0" },
    (event) => {
      if (event.code !== "Numpad0") {
        return;
      }

      event.preventDefault();
      reactFlow.setViewport(
        { x: 0, y: 0, zoom: 1 },
        { duration: FLOW_CANVAS_RESET_DURATION_MS },
      );
    },
    {
      conflictBehavior: "allow",
    },
  );

  useHotkey(
    "Escape",
    () => {
      wallToolsControllerRef.current?.cancelTool();
    },
    {
      conflictBehavior: "allow",
      enabled: isEditMode && activeDrawTool !== "device",
    },
  );

  useHotkey(
    FLOW_CANVAS_TOGGLE_DEBUG_HOTKEY as Hotkey,
    () => {
      setIsWallDebugVisible((prev) => !prev);
    },
    {
      conflictBehavior: "allow",
      enabled: isEditMode,
    },
  );

  // Pan shortcuts — move the canvas with arrow keys
  useShortcut("pan-up", () => {
    const { x, y, zoom } = reactFlow.getViewport();
    reactFlow.setViewport({ x, y: y + PAN_AMOUNT, zoom });
  });

  useShortcut("pan-down", () => {
    const { x, y, zoom } = reactFlow.getViewport();
    reactFlow.setViewport({ x, y: y - PAN_AMOUNT, zoom });
  });

  useShortcut("pan-left", () => {
    const { x, y, zoom } = reactFlow.getViewport();
    reactFlow.setViewport({ x: x + PAN_AMOUNT, y, zoom });
  });

  useShortcut("pan-right", () => {
    const { x, y, zoom } = reactFlow.getViewport();
    reactFlow.setViewport({ x: x - PAN_AMOUNT, y, zoom });
  });

  useConnectionHighlightShortcut();

  const handlePaneMouseMove = useCallback((event: React.MouseEvent) => {
    wallToolsControllerRef.current?.handlePaneMouseMove(event);
  }, []);

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
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
