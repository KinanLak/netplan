import { useEffect, useRef } from "react";
import {
  getViewportForBounds,
  useOnViewportChange,
  useStore,
} from "@xyflow/react";
import type { ReactFlowInstance, Viewport } from "@xyflow/react";
import {
  FLOOR_FIT_MAX_ZOOM,
  floorContentBounds,
  readFloorView,
  writeFloorView,
} from "@/canvas/floorView";
import {
  useMapDocumentData,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useCurrentFloorId } from "@/store/selectors";
import {
  FLOW_CANVAS_FIT_VIEW_PADDING,
  FLOW_CANVAS_MIN_ZOOM,
} from "@/lib/constants";

const EMPTY_FLOOR_VIEW: Viewport = { x: 0, y: 0, zoom: 1 };

/**
 * Each floor opens on its last view in this tab, or, the first time, fitted
 * to what is drawn on it; the view is never refitted when devices arrive
 * (ADR 0029). Returns the fit, for "Centrer la vue".
 */
export function useFloorViewport(reactFlow: ReactFlowInstance) {
  const currentFloorId = useCurrentFloorId();
  const isReady = useMapDocumentReady();
  const { document } = useMapDocumentData();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  // The floor whose view the canvas shows; until it is set, a move belongs
  // to no floor and is not kept.
  const shownFloorRef = useRef<string | null>(null);

  const fitViewport = (): Viewport | null => {
    const bounds = floorContentBounds(document);
    if (!bounds || width === 0 || height === 0) return null;
    return getViewportForBounds(
      bounds,
      width,
      height,
      FLOW_CANVAS_MIN_ZOOM,
      FLOOR_FIT_MAX_ZOOM,
      FLOW_CANVAS_FIT_VIEW_PADDING,
    );
  };

  const isLoaded =
    currentFloorId !== null &&
    isReady &&
    document.floorId === currentFloorId &&
    width > 0 &&
    height > 0;

  useEffect(() => {
    if (!isLoaded || shownFloorRef.current === currentFloorId) return;
    shownFloorRef.current = currentFloorId;
    void reactFlow.setViewport(
      readFloorView(currentFloorId) ?? fitViewport() ?? EMPTY_FLOOR_VIEW,
    );
  });

  useOnViewportChange({
    onEnd: (viewport) => {
      const floorId = shownFloorRef.current;
      if (floorId && floorId === currentFloorId) {
        writeFloorView(floorId, viewport);
      }
    },
  });

  return { fitViewport };
}
