import { useEffect, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useStore } from "@xyflow/react";
import type { WallSegment } from "@/types/map";
import { FLOW_CANVAS_PANE_HOVER_COLORS } from "@/lib/constants";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import {
  useMapDocumentData,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { wallConflicts } from "@/walls/gridGeometry";
import {
  createBrushWallDraft,
  splitWallDraftIntoBlocks,
} from "@/walls/gridGeometry/drafts";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedWallColor,
} from "@/store/selectors";
import { useWallToolSession } from "@/walls/useWallToolSession";
import { WallOverlay } from "./WallOverlay";
import { WallDrawMessage } from "./WallDrawMessage";
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
  const { document } = useMapDocumentData();
  const selectedWallColor = useSelectedWallColor();

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

  // React Flow has no pane press callback, so the layer listens itself.
  // Space pans and Shift selects with the left button, as React Flow
  // reads them; such a press is navigation, not the first point of a shape.
  const isSpaceHeldRef = useRef(false);
  useEffect(() => {
    const track = (event: KeyboardEvent) => {
      if (event.code === "Space")
        isSpaceHeldRef.current = event.type === "keydown";
    };
    const release = () => {
      isSpaceHeldRef.current = false;
    };
    window.addEventListener("keydown", track);
    window.addEventListener("keyup", track);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", track);
      window.removeEventListener("keyup", track);
      window.removeEventListener("blur", release);
    };
  }, []);

  const handlePanePointerDown = (event: PointerEvent) => {
    if (!isReady || !isEditMode || activeDrawTool === "device") return;
    if (
      isSpaceHeldRef.current ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (!(event.target as Element).classList.contains("react-flow__pane")) {
      return;
    }
    session.handlePanePointerDown(event);
  };
  const pointerDownRef = useRef(handlePanePointerDown);
  useEffect(() => {
    pointerDownRef.current = handlePanePointerDown;
  });
  useEffect(() => {
    if (!canvasDomNode) return;
    const listener = (event: PointerEvent) => pointerDownRef.current(event);
    canvasDomNode.addEventListener("pointerdown", listener);
    return () => canvasDomNode.removeEventListener("pointerdown", listener);
  }, [canvasDomNode]);

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

  // A wall or a room over a device shows where it is blocked before the
  // click that would be refused (A13).
  const drawn =
    activeDrawTool === "wall-brush" && session.hoverSnapPoint && currentFloorId
      ? // The brush draft is a stub the engine widens into its cell.
        splitWallDraftIntoBlocks(
          createBrushWallDraft(
            currentFloorId,
            session.hoverSnapPoint,
            selectedWallColor,
          ),
        )
      : session.previewSegments;
  const conflicts = isEditMode
    ? wallConflicts(
        drawn,
        document.devices.filter((device) => device.floorId === currentFloorId),
      )
    : { blocks: [], devices: [] };

  return (
    <>
      <WallOverlay
        blockedBlocks={conflicts.blocks}
        crossedDevices={conflicts.devices}
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

      <WallDrawMessage
        isVisible={isEditMode && isReady && activeDrawTool !== "device"}
        message={session.drawMessage}
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
