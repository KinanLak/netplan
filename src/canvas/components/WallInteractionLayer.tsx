import { useEffect } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "@xyflow/react";
import type { WallSegment } from "@/types/map";
import { FLOW_CANVAS_PANE_HOVER_COLORS } from "@/lib/constants";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { useMapDocumentReady } from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
} from "@/store/selectors";
import { useWallToolSession } from "@/walls/useWallToolSession";
import { WallOverlay } from "./WallOverlay";
import { WallToolHelpCard } from "./WallToolHelpCard";
import { WallDebugPanel } from "./WallDebugPanel";

export interface WallPaneHandlers {
  onPaneMouseMove: (event: ReactMouseEvent) => void;
  onPaneClick: (event: ReactMouseEvent) => void;
  onContextMenu: (event: ReactMouseEvent | MouseEvent) => void;
}

/**
 * Stable pane-event callbacks handed to <ReactFlow> once. The wall layer
 * swaps the underlying handlers on every render, so pointer interaction
 * state lives entirely below the canvas shell and never re-renders it (or
 * the device nodes) on mouse moves.
 */
export class WallPaneEventBridge {
  private handlers: WallPaneHandlers | null = null;

  register(handlers: WallPaneHandlers | null) {
    this.handlers = handlers;
  }

  readonly onPaneMouseMove = (event: ReactMouseEvent) => {
    this.handlers?.onPaneMouseMove(event);
  };

  readonly onPaneClick = (event: ReactMouseEvent) => {
    this.handlers?.onPaneClick(event);
  };

  readonly onContextMenu = (event: ReactMouseEvent | MouseEvent) => {
    this.handlers?.onContextMenu(event);
  };
}

export const createWallPaneEventBridge = (): WallPaneEventBridge =>
  new WallPaneEventBridge();

interface WallInteractionLayerProps {
  bridge: WallPaneEventBridge;
  floorWalls: Array<WallSegment>;
}

export function WallInteractionLayer({
  bridge,
  floorWalls,
}: WallInteractionLayerProps) {
  const session = useWallToolSession();
  const isReady = useMapDocumentReady();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const currentFloorId = useCurrentFloorId();
  const selectDevice = useMapStore((s) => s.selectDevice);
  const canvasDomNode = useStore((store) => store.domNode);

  useShortcutIntentEffect("cancel-wall-tool", session.cancelTool);
  useShortcutIntentEffect("toggle-wall-debug", session.toggleDebugPanel);

  const handlePaneMouseMove = (event: ReactMouseEvent) => {
    if (isReady && isEditMode && activeDrawTool !== "device") {
      session.handlePaneMouseMove(event);
    }
  };

  const handlePaneClick = (event: ReactMouseEvent) => {
    if (!currentFloorId || !isEditMode || activeDrawTool === "device") {
      selectDevice(null);
      return;
    }

    if (!isReady) return;

    selectDevice(null);
    session.handlePaneClick(event);
  };

  const handleContextMenu = (event: ReactMouseEvent | MouseEvent) => {
    if (!isReady) return;
    session.handleContextMenu(event);
  };

  useEffect(() => {
    bridge.register({
      onPaneMouseMove: handlePaneMouseMove,
      onPaneClick: handlePaneClick,
      onContextMenu: handleContextMenu,
    });
  });

  useEffect(() => {
    return () => {
      bridge.register(null);
    };
  }, [bridge]);

  useEffect(() => {
    if (!canvasDomNode) return;
    const cursorClass = session.paneCursorClass;
    canvasDomNode.classList.add(cursorClass);
    return () => {
      canvasDomNode.classList.remove(cursorClass);
    };
  }, [canvasDomNode, session.paneCursorClass]);

  const isWallDeleteTool = activeDrawTool === "wall-erase";
  const paneHoverFillColor = isWallDeleteTool
    ? FLOW_CANVAS_PANE_HOVER_COLORS.erase.fill
    : FLOW_CANVAS_PANE_HOVER_COLORS.draw.fill;
  const paneHoverStrokeColor = isWallDeleteTool
    ? FLOW_CANVAS_PANE_HOVER_COLORS.erase.stroke
    : FLOW_CANVAS_PANE_HOVER_COLORS.draw.stroke;

  return (
    <>
      <WallOverlay
        floorWalls={floorWalls}
        previewSegments={session.previewSegments}
        erasePreviewKeys={session.erasePreviewKeys}
        erasePreviewPointer={session.erasePreviewPointer}
        isEraseStrokeActive={session.isEraseStrokeActive}
        wallEraserSize={session.wallEraserSize}
        activeDrawTool={activeDrawTool}
        drawAnchor={session.drawAnchor}
        hoverSnapPoint={session.hoverSnapPoint}
        paneHoverFillColor={paneHoverFillColor}
        paneHoverStrokeColor={paneHoverStrokeColor}
      />

      <WallToolHelpCard
        isVisible={isEditMode && isReady && activeDrawTool !== "device"}
        drawMessage={session.drawMessage}
      />

      <WallDebugPanel
        isVisible={session.isDebugPanelVisible}
        activeDrawTool={activeDrawTool}
        pointerPosition={session.pointerPosition}
        hoverSnapPoint={session.hoverSnapPoint}
        pointerSnapPoint={session.pointerSnapPoint}
        drawAnchor={session.drawAnchor}
        lastWallStartPoint={session.lastWallStartPoint}
        erasePreviewCount={session.erasePreviewKeys.length}
        drawMessage={session.drawMessage}
      />
    </>
  );
}
