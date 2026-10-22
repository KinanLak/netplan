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
import { useCurrentFloorId, useSelectedDeviceId } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import {
  DEVICE_DRAWER_WIDTH_PX,
  FLOW_CANVAS_FIT_VIEW_PADDING,
  FLOW_CANVAS_LOCATE_DURATION_MS,
  FLOW_CANVAS_LOCATE_MIN_ZOOM,
  FLOW_CANVAS_MIN_ZOOM,
} from "@/lib/constants";

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/** A brief ring on the node, so the eye finds what the camera brought. */
function flashDeviceNode(deviceId: string) {
  const node = window.document.querySelector(
    `.react-flow__node[data-id="${CSS.escape(deviceId)}"]`,
  );
  if (!node) return;
  node.classList.remove("device-locate-flash");
  // Restarts the animation when the same device is located twice.
  void (node as HTMLElement).offsetWidth;
  node.classList.add("device-locate-flash");
  node.addEventListener(
    "animationend",
    () => node.classList.remove("device-locate-flash"),
    { once: true },
  );
}

const EMPTY_FLOOR_VIEW: Viewport = { x: 0, y: 0, zoom: 1 };

/**
 * Each floor opens on its last view in this tab, or, the first time, fitted
 * to what is drawn on it; the view is never refitted when devices arrive
 * (ADR 0030). Returns the fit, for "Centrer la vue".
 */
export function useFloorViewport(reactFlow: ReactFlowInstance) {
  const currentFloorId = useCurrentFloorId();
  const isReady = useMapDocumentReady();
  const { document } = useMapDocumentData();
  const selectedDeviceId = useSelectedDeviceId();
  const locateRequest = useMapStore((state) => state.locateRequest);
  const clearLocateRequest = useMapStore((state) => state.clearLocateRequest);
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
    if (!isLoaded) return;
    if (shownFloorRef.current !== currentFloorId) {
      shownFloorRef.current = currentFloorId;
      void reactFlow.setViewport(
        readFloorView(currentFloorId) ?? fitViewport() ?? EMPTY_FLOOR_VIEW,
      );
    }
    if (!locateRequest) return;
    clearLocateRequest(locateRequest.nonce);
    const device = document.devices.find(
      (candidate) => candidate.id === locateRequest.deviceId,
    );
    if (!device) return;
    // Centred in what the drawer leaves visible, not under it (A9).
    const zoom = Math.max(reactFlow.getZoom(), FLOW_CANVAS_LOCATE_MIN_ZOOM);
    const drawer = selectedDeviceId ? DEVICE_DRAWER_WIDTH_PX : 0;
    void reactFlow
      .setCenter(
        device.position.x + device.size.width / 2 + drawer / 2 / zoom,
        device.position.y + device.size.height / 2,
        {
          zoom,
          duration: FLOW_CANVAS_LOCATE_DURATION_MS,
          ease: easeOutCubic,
        },
      )
      .then(() => flashDeviceNode(device.id));
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
