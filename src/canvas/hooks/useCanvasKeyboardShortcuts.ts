import { useEffect, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import type { ReactFlowInstance } from "@xyflow/react";
import type { DrawTool } from "@/types/map";
import type { WallToolsLayerHandle } from "@/canvas/components/WallToolsLayer";
import { useShortcut } from "@/hooks/use-shortcuts";
import {
  FLOW_CANVAS_RESET_DURATION_MS,
  FLOW_CANVAS_TOGGLE_DEBUG_HOTKEY,
  FLOW_CANVAS_ZOOM_DURATION_MS,
  PAN_AMOUNT,
} from "@/lib/constants";
import { useConnectionHighlightShortcut } from "@/canvas/hooks/useConnectionHighlightShortcut";

interface UseCanvasKeyboardShortcutsOptions {
  reactFlow: ReactFlowInstance;
  wallToolsControllerRef: React.RefObject<WallToolsLayerHandle | null>;
  isEditMode: boolean;
  activeDrawTool: DrawTool;
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
  isEditMode,
  activeDrawTool,
}: UseCanvasKeyboardShortcutsOptions) {
  const [isWallDebugVisible, setIsWallDebugVisible] = useState(false);

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
      if (event.defaultPrevented) {
        return;
      }

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
      if (event.defaultPrevented) {
        return;
      }

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
    FLOW_CANVAS_TOGGLE_DEBUG_HOTKEY,
    () => {
      setIsWallDebugVisible((prev) => !prev);
    },
    {
      conflictBehavior: "allow",
      enabled: isEditMode,
    },
  );

  // Pan shortcuts — move the canvas with arrow keys
  const applyPan = (dx: number, dy: number) => {
    const { x, y, zoom } = reactFlow.getViewport();
    reactFlow.setViewport({ x: x + dx, y: y + dy, zoom });
  };

  useShortcut("pan-up", () => {
    applyPan(0, PAN_AMOUNT);
  });

  useShortcut("pan-down", () => {
    applyPan(0, -PAN_AMOUNT);
  });

  useShortcut("pan-left", () => {
    applyPan(PAN_AMOUNT, 0);
  });

  useShortcut("pan-right", () => {
    applyPan(-PAN_AMOUNT, 0);
  });

  useConnectionHighlightShortcut();

  return { isWallDebugVisible };
}
