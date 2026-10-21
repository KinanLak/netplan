import type { ReactFlowInstance } from "@xyflow/react";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import {
  FLOW_CANVAS_CENTER_DURATION_MS,
  FLOW_CANVAS_FIT_VIEW_PADDING,
  FLOW_CANVAS_RESET_DURATION_MS,
  FLOW_CANVAS_ZOOM_DURATION_MS,
} from "@/lib/constants";

interface UseCanvasKeyboardShortcutsOptions {
  reactFlow: ReactFlowInstance;
}

/** The view's shortcuts; arrow keys never pan the map (ADR 0030). */
export function useCanvasKeyboardShortcuts({
  reactFlow,
}: UseCanvasKeyboardShortcutsOptions) {
  const zoomIn = () => {
    void reactFlow.zoomIn({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  };
  const zoomOut = () => {
    void reactFlow.zoomOut({ duration: FLOW_CANVAS_ZOOM_DURATION_MS });
  };
  const fitFloor = () => {
    void reactFlow.fitView({
      padding: FLOW_CANVAS_FIT_VIEW_PADDING,
      duration: FLOW_CANVAS_CENTER_DURATION_MS,
    });
  };

  useShortcutIntentEffect("zoom-in", zoomIn);
  useShortcutIntentEffect("zoom-out", zoomOut);
  // Around the centre of the view, so what the user looks at stays there.
  useShortcutIntentEffect("zoom-reset", () => {
    void reactFlow.zoomTo(1, { duration: FLOW_CANVAS_RESET_DURATION_MS });
  });
  useShortcutIntentEffect("fit-view", fitFloor);

  return { zoomIn, zoomOut, fitFloor };
}
