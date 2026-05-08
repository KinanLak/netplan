import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  useReactFlow,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import { nodeTypes } from "./nodeTypes";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import { useMapCommands } from "@/store/useMapCommands";
import { useIdentity } from "@/lib/identity";
import { GRID_SIZE } from "@/lib/grid";
import { cn } from "@/lib/utils";
import { CanvasZoomControls } from "@/canvas/components/CanvasZoomControls";
import { WallToolsLayer } from "@/canvas/components/WallToolsLayer";
import { useCanvasDeviceNodes } from "@/canvas/hooks/useCanvasDeviceNodes";
import { useCanvasDragState } from "@/canvas/hooks/useCanvasDragState";
import { useCanvasKeyboardShortcuts } from "@/canvas/hooks/useCanvasKeyboardShortcuts";
import { useWallToolSession } from "@/walls/useWallToolSession";
import { PresenceCursors } from "./PresenceCursors";
import { api } from "../../convex/_generated/api";
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
const PRESENCE_THROTTLE_MS = 1000 / 30;

export default function FlowCanvas() {
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const identity = useIdentity();
  const updateCursor = useMutation(api.presences.updateCursor);
  const removePresence = useMutation(api.presences.remove);

  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);
  const reactFlow = useReactFlow();

  const commands = useMapCommands(currentFloorId);
  const { devices, walls, updateDevicePosition, checkCollision } = commands;

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
  const wallToolSession = useWallToolSession();

  useCanvasKeyboardShortcuts({
    reactFlow,
    cancelWallTool: wallToolSession.cancelTool,
    toggleWallDebugPanel: wallToolSession.toggleDebugPanel,
  });

  const lastCursorAtRef = useRef(0);

  const publishCursor = (event: React.MouseEvent) => {
    if (!identity || !currentFloorId) return;
    const now = performance.now();
    if (now - lastCursorAtRef.current < PRESENCE_THROTTLE_MS) return;
    lastCursorAtRef.current = now;
    const flowPosition = reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    void updateCursor({
      sessionId: identity.sessionId,
      displayName: identity.displayName,
      colorHue: identity.colorHue,
      floorId: currentFloorId,
      cursor: flowPosition,
      selectedDeviceId: selectedDeviceId ?? undefined,
    });
  };

  useEffect(() => {
    if (!identity) return;
    const sessionId = identity.sessionId;
    return () => {
      void removePresence({ sessionId });
    };
  }, [identity, removePresence]);

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
    wallToolSession.handlePaneClick(event);
  };

  const handleContextMenu = (event: React.MouseEvent | MouseEvent) => {
    wallToolSession.handleContextMenu(event);
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
        edges={EMPTY_EDGES}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        onNodeContextMenu={handleContextMenu}
        onPaneClick={handlePaneClick}
        onPaneMouseMove={(event) => {
          publishCursor(event);
          wallToolSession.handlePaneMouseMove(event);
        }}
        onPaneContextMenu={handleContextMenu}
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
          wallToolSession.paneCursorClass,
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
          session={wallToolSession}
          floorWalls={floorWalls}
          activeDrawTool={activeDrawTool}
          isEditMode={isEditMode}
          paneHoverFillColor={paneHoverFillColor}
          paneHoverStrokeColor={paneHoverStrokeColor}
        />

        <PresenceCursors identity={identity} floorId={currentFloorId} />
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
