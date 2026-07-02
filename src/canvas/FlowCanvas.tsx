import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReactFlow, useOnViewportChange, useReactFlow } from "@xyflow/react";
import type { Viewport } from "@xyflow/react";
import { nodeTypes } from "./nodeTypes";
import type { DeviceNode } from "@/devices/reactFlowDeviceAdapter";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import {
  useMapDocumentActions,
  useMapDocumentData,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { GRID_SIZE } from "@/lib/grid";
import { cn } from "@/lib/utils";
import { CanvasZoomControls } from "@/canvas/components/CanvasZoomControls";
import {
  WallInteractionLayer,
  createWallPaneEventBridge,
} from "@/canvas/components/WallInteractionLayer";
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
  FLOW_CANVAS_ZOOM_DURATION_MS,
} from "@/lib/constants";

const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];
const EMPTY_EDGES: Array<never> = [];
const FIT_VIEW_OPTIONS = { padding: FLOW_CANVAS_FIT_VIEW_PADDING };
const PRO_OPTIONS = { hideAttribution: true };
const ALL_MOUSE_PAN_BUTTONS = [0, 1, 2];
const RIGHT_MOUSE_PAN_BUTTON = [2];
const BACKGROUND_GRID_STEPS = [4, 2, 1] as const;
const BACKGROUND_COARSE_TO_MEDIUM_ZOOM = 0.4;
const BACKGROUND_MEDIUM_TO_FINE_ZOOM = 0.75;
const BACKGROUND_ZOOM_FADE_RANGE = 0.22;

type FlowCanvasBackgroundStyle = CSSProperties & {
  position: "absolute";
  width: "100%";
  height: "100%";
  top: 0;
  left: 0;
};

type FlowCanvasBackgroundLayerStyle = CSSProperties & {
  "--flow-canvas-background-color": string;
  "--flow-canvas-background-dot-radius": string;
  "--flow-canvas-background-gap": string;
  "--flow-canvas-background-position-x": string;
  "--flow-canvas-background-position-y": string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

  return t * t * (3 - 2 * t);
}

function getFlowCanvasBackgroundLayerOpacity(
  step: (typeof BACKGROUND_GRID_STEPS)[number],
  zoom: number,
) {
  const mediumAmount = smoothstep(
    BACKGROUND_COARSE_TO_MEDIUM_ZOOM - BACKGROUND_ZOOM_FADE_RANGE / 2,
    BACKGROUND_COARSE_TO_MEDIUM_ZOOM + BACKGROUND_ZOOM_FADE_RANGE / 2,
    zoom,
  );
  const fineAmount = smoothstep(
    BACKGROUND_MEDIUM_TO_FINE_ZOOM - BACKGROUND_ZOOM_FADE_RANGE / 2,
    BACKGROUND_MEDIUM_TO_FINE_ZOOM + BACKGROUND_ZOOM_FADE_RANGE / 2,
    zoom,
  );

  if (step === 4) return 1 - mediumAmount;
  if (step === 2) return mediumAmount * (1 - fineAmount);

  return fineAmount;
}

const FLOW_CANVAS_BACKGROUND_STYLE: FlowCanvasBackgroundStyle = {
  position: "absolute",
  width: "100%",
  height: "100%",
  top: 0,
  left: 0,
};

const FLOW_CANVAS_BACKGROUND_LAYER_STYLES = BACKGROUND_GRID_STEPS.map(
  (step): FlowCanvasBackgroundLayerStyle => {
    const gap = GRID_SIZE * step;

    return {
      "--flow-canvas-background-color": FLOW_CANVAS_BACKGROUND_COLOR,
      "--flow-canvas-background-dot-radius": `${FLOW_CANVAS_BACKGROUND_DOT_SIZE / 2}px`,
      "--flow-canvas-background-gap": `${gap}px`,
      "--flow-canvas-background-position-x": `${-gap / 2}px`,
      "--flow-canvas-background-position-y": `${-gap / 2}px`,
      opacity: step === 1 ? 1 : 0,
    };
  },
);

function updateFlowCanvasBackgroundLayer(
  background: HTMLElement,
  { x, y, zoom }: Viewport,
  step: (typeof BACKGROUND_GRID_STEPS)[number],
  previousZoom: number | null,
) {
  const gap = GRID_SIZE * zoom * step;

  if (previousZoom !== zoom) {
    background.style.setProperty("--flow-canvas-background-gap", `${gap}px`);
    background.style.opacity = `${getFlowCanvasBackgroundLayerOpacity(
      step,
      zoom,
    )}`;
  }

  background.style.setProperty(
    "--flow-canvas-background-position-x",
    `${(x - gap / 2) % gap}px`,
  );
  background.style.setProperty(
    "--flow-canvas-background-position-y",
    `${(y - gap / 2) % gap}px`,
  );
}

function FlowCanvasBackground() {
  const backgroundRefs = useRef<Array<HTMLDivElement | null>>([]);
  const previousZoomRef = useRef<number | null>(null);
  const reactFlow = useReactFlow();

  const syncViewport = (viewport: Viewport) => {
    BACKGROUND_GRID_STEPS.forEach((step, index) => {
      const background = backgroundRefs.current[index];
      if (!background) return;

      updateFlowCanvasBackgroundLayer(
        background,
        viewport,
        step,
        previousZoomRef.current,
      );
    });
    previousZoomRef.current = viewport.zoom;
  };

  const setBackgroundRef = (
    index: number,
    background: HTMLDivElement | null,
  ) => {
    backgroundRefs.current[index] = background;
  };

  useOnViewportChange({
    onStart: syncViewport,
    onChange: syncViewport,
    onEnd: syncViewport,
  });

  useEffect(() => {
    const syncCurrentViewport = () => syncViewport(reactFlow.getViewport());

    syncCurrentViewport();
    const animationFrame = window.requestAnimationFrame(syncCurrentViewport);

    return () => window.cancelAnimationFrame(animationFrame);
  });

  return (
    <div
      className="react-flow__background flow-canvas-background"
      style={FLOW_CANVAS_BACKGROUND_STYLE}
    >
      {BACKGROUND_GRID_STEPS.map((step, index) => (
        <div
          key={step}
          ref={(background) => setBackgroundRef(index, background)}
          className="flow-canvas-background-layer"
          style={FLOW_CANVAS_BACKGROUND_LAYER_STYLES[index]}
        />
      ))}
    </div>
  );
}

export default function FlowCanvas() {
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();

  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);
  const reactFlow = useReactFlow();

  const { document } = useMapDocumentData();
  const isReady = useMapDocumentReady();
  const { commands } = useMapDocumentActions();
  const { devices, walls } = document;
  const { updateDevicePosition, checkCollision } = commands;

  const canEditDevices = isEditMode && activeDrawTool === "device" && isReady;
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
  // Wall pointer interaction lives in WallInteractionLayer below; the shell
  // only hands ReactFlow these identity-stable bridge callbacks.
  const [paneBridge] = useState(createWallPaneEventBridge);

  useCanvasKeyboardShortcuts({ reactFlow });

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
  const panOnDrag =
    isWallDeleteTool || isWallBrushTool
      ? RIGHT_MOUSE_PAN_BUTTON
      : ALL_MOUSE_PAN_BUTTONS;

  const editModeHaloColor = isWallDeleteTool
    ? FLOW_CANVAS_HALO_SHADOWS.erase
    : FLOW_CANVAS_HALO_SHADOWS.draw;
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
        onNodeContextMenu={paneBridge.onContextMenu}
        onPaneClick={paneBridge.onPaneClick}
        onPaneMouseMove={paneBridge.onPaneMouseMove}
        onPaneContextMenu={paneBridge.onContextMenu}
        onMoveStart={handleMoveStart}
        onMoveEnd={handleMoveEnd}
        nodeTypes={nodeTypes}
        snapToGrid={true}
        snapGrid={SNAP_GRID}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={FLOW_CANVAS_MIN_ZOOM}
        maxZoom={FLOW_CANVAS_MAX_ZOOM}
        panOnDrag={panOnDrag}
        panOnScroll={true}
        deleteKeyCode={null}
        nodesDraggable={canEditDevices}
        className={cn(isCursorDragging && "canvas-cursor-grabbing")}
        proOptions={PRO_OPTIONS}
      >
        <FlowCanvasBackground />

        <WallInteractionLayer bridge={paneBridge} floorWalls={floorWalls} />
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
