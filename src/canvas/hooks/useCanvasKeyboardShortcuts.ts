import type { ReactFlowInstance } from "@xyflow/react";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import {
  FLOW_CANVAS_RESET_DURATION_MS,
  FLOW_CANVAS_ZOOM_DURATION_MS,
  PAN_AMOUNT,
} from "@/lib/constants";

interface UseCanvasKeyboardShortcutsOptions {
  reactFlow: ReactFlowInstance;
}

export function useCanvasKeyboardShortcuts({
  reactFlow,
}: UseCanvasKeyboardShortcutsOptions) {
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
}
