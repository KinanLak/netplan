import { useReactFlow, useStoreApi } from "@xyflow/react";
import { floorMinZoom } from "@/canvas/floorView";
import {
  FLOW_CANVAS_CENTER_DURATION_MS,
  FLOW_CANVAS_FIT_VIEW_PADDING,
} from "@/lib/constants";
import type { FloorOverlay } from "@/types/map";
import { overlayBounds } from "./calibration";

/** Moves the view, briefly, onto the whole calque. */
export const useFitOverlay = () => {
  const reactFlow = useReactFlow();
  const store = useStoreApi();
  return (overlay: FloorOverlay) => {
    const bounds = overlayBounds(overlay);
    // The canvas lowers its own limit once it has drawn the new calque;
    // the fit runs now, so it lowers it first (A26).
    const { width, height, minZoom, setMinZoom } = store.getState();
    const needed = floorMinZoom(bounds, width, height);
    if (needed < minZoom) setMinZoom(needed);
    void reactFlow.fitBounds(bounds, {
      padding: FLOW_CANVAS_FIT_VIEW_PADDING,
      duration: FLOW_CANVAS_CENTER_DURATION_MS,
    });
  };
};
