import { useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import type { WallToolsLayerHandle } from "@/canvas/components/WallToolsLayer";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import {
  FLOW_CANVAS_RESET_DURATION_MS,
  FLOW_CANVAS_ZOOM_DURATION_MS,
  PAN_AMOUNT,
} from "@/lib/constants";
import { useMapStore } from "@/store/useMapStore";

interface UseCanvasKeyboardShortcutsOptions {
  reactFlow: ReactFlowInstance;
  wallToolsControllerRef: React.RefObject<WallToolsLayerHandle | null>;
}

/**
 * Registers all keyboard shortcuts for the canvas: zoom, pan, numpad,
 * escape (cancel tool), debug toggle, and connection highlight.
 *
 * Returns `isWallDebugVisible` so the parent can pass it to the wall layer.
 */
export function useCanvasKeyboardShortcuts({
  reactFlow,
  wallToolsControllerRef,
}: UseCanvasKeyboardShortcutsOptions) {
  const [isWallDebugVisible, setIsWallDebugVisible] = useState(false);
  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);

  useShortcutIntentEffect("zoom-in", () => {
    reactFlow.zoomIn({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  });

  useShortcutIntentEffect("zoom-out", () => {
    reactFlow.zoomOut({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  });

  useShortcutIntentEffect("zoom-reset", () => {
    reactFlow.setViewport(
      { x: 0, y: 0, zoom: 1 },
      { duration: FLOW_CANVAS_RESET_DURATION_MS },
    );
  });

  useShortcutIntentEffect("cancel-wall-tool", () => {
    wallToolsControllerRef.current?.cancelTool();
    setActiveDrawTool("device");
  });

  useShortcutIntentEffect("toggle-wall-debug", () => {
    setIsWallDebugVisible((prev) => !prev);
  });

  // Pan shortcuts — move the canvas with arrow keys
  const applyPan = (dx: number, dy: number) => {
    const { x, y, zoom } = reactFlow.getViewport();
    reactFlow.setViewport({ x: x + dx, y: y + dy, zoom });
  };

  useShortcutIntentEffect("pan-up", () => {
    applyPan(0, PAN_AMOUNT);
  });

  useShortcutIntentEffect("pan-down", () => {
    applyPan(0, -PAN_AMOUNT);
  });

  useShortcutIntentEffect("pan-left", () => {
    applyPan(PAN_AMOUNT, 0);
  });

  useShortcutIntentEffect("pan-right", () => {
    applyPan(-PAN_AMOUNT, 0);
  });

  return { isWallDebugVisible };
}
