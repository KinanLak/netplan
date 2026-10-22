import { useReactFlow } from "@xyflow/react";
import {
  FLOW_CANVAS_CENTER_DURATION_MS,
  FLOW_CANVAS_FIT_VIEW_PADDING,
} from "@/lib/constants";
import type { FloorOverlay } from "@/types/map";
import { overlayBounds } from "./calibration";

/** Moves the view, briefly, onto the whole calque. */
export const useFitOverlay = () => {
  const reactFlow = useReactFlow();
  return (overlay: FloorOverlay) => {
    void reactFlow.fitBounds(overlayBounds(overlay), {
      padding: FLOW_CANVAS_FIT_VIEW_PADDING,
      duration: FLOW_CANVAS_CENTER_DURATION_MS,
    });
  };
};
