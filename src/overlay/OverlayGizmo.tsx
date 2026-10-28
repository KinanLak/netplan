import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
import { ViewportPortal, useReactFlow, useStore } from "@xyflow/react";
import { applyOverlayPatch } from "@/map-engine/overlay";
import {
  useMapDocumentActions,
  useMapDocumentData,
} from "@/map-session/useMapDocument";
import {
  useIsEditMode,
  useIsOverlayHidden,
  useIsOverlayPanelOpen,
} from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { FloorOverlay } from "@/types/map";
import { OverlayCalibrationLayer } from "./OverlayCalibrationLayer";
import { gesturePatch, patchChangesOverlay } from "./gesture";
import type { OverlayCorner, OverlayGesture } from "./gesture";

/** Handle sizes in screen pixels, whatever the zoom. */
const HANDLE_SIZE = 10;
const ROTATE_HANDLE_SIZE = 12;
const ROTATE_HANDLE_GAP = 28;
const FRAME_WIDTH = 1.5;

const corners: ReadonlyArray<OverlayCorner> = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

/**
 * Move, resize and rotate handles on the calque while its panel is open, or
 * the calibration points while they are being picked. A gesture previews
 * through the store's draft and commits one undoable patch on release.
 */
export function OverlayGizmo() {
  const isOpen = useIsOverlayPanelOpen();
  const isEditMode = useIsEditMode();
  const isHidden = useIsOverlayHidden();
  const calibration = useMapStore((s) => s.overlayCalibration);
  const { document } = useMapDocumentData();
  const overlay =
    document.overlay?.floorId === document.floorId ? document.overlay : null;

  if (!isOpen || !isEditMode || isHidden || !overlay || overlay.locked) {
    return null;
  }
  // Points picked on a replaced image would not mean anything on the new one.
  if (calibration?.fileId === overlay.fileId) {
    return (
      <OverlayCalibrationLayer overlay={overlay} calibration={calibration} />
    );
  }
  return <OverlayGizmoFrame overlay={overlay} />;
}

function OverlayGizmoFrame({ overlay }: { overlay: FloorOverlay }) {
  const draft = useMapStore((s) => s.overlayDraft);
  const setOverlayDraft = useMapStore((s) => s.setOverlayDraft);
  const { commands } = useMapDocumentActions();
  const { screenToFlowPosition } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const gestureRef = useRef<OverlayGesture | null>(null);

  // A gesture cut short by closing the panel must not leave its preview.
  useEffect(() => () => setOverlayDraft(null), [setOverlayDraft]);

  const shown = draft ? applyOverlayPatch(overlay, draft) : overlay;
  const width = overlay.imageWidth * shown.scale;
  const height = overlay.imageHeight * shown.scale;
  const px = (size: number) => size / zoom;

  // The canvas snaps to the wall grid; a plan is aligned freely on top of it.
  const toPlan = (event: PointerEvent) =>
    screenToFlowPosition(
      { x: event.clientX, y: event.clientY },
      { snapToGrid: false },
    );

  const beginGesture = (
    event: PointerEvent<HTMLElement>,
    start: (from: OverlayGesture["from"]) => OverlayGesture,
  ) => {
    if (event.button !== 0) return;
    // The pane would otherwise pan, or take it as a click on the plan.
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = start(toPlan(event));
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    setOverlayDraft(gesturePatch(gesture, toPlan(event), event.shiftKey));
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    const patch = gesturePatch(gesture, toPlan(event), event.shiftKey);
    if (patchChangesOverlay(gesture.overlay, patch)) {
      commands.patchOverlay(patch);
    }
    setOverlayDraft(null);
  };

  const handlePointerCancel = () => {
    gestureRef.current = null;
    setOverlayDraft(null);
  };

  const handleStyle = (size: number) => ({
    width: px(size),
    height: px(size),
    borderWidth: px(FRAME_WIDTH),
  });

  return (
    <ViewportPortal>
      {/* React Flow's viewport takes no pointer events; the portal inherits it. */}
      <div
        className="nopan nodrag pointer-events-auto absolute top-0 left-0 cursor-move border-primary"
        data-testid="floor-overlay-gizmo"
        title="Déplacer le calque"
        style={{
          width,
          height,
          borderWidth: px(FRAME_WIDTH),
          // Above the walls and devices, which are not editable meanwhile.
          zIndex: 1001,
          transformOrigin: "0 0",
          transform: `translate(${shown.center.x}px, ${shown.center.y}px) rotate(${shown.rotation}deg) translate(-50%, -50%)`,
        }}
        onPointerDown={(event) =>
          beginGesture(event, (from) => ({ kind: "move", overlay, from }))
        }
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {corners.map((corner) => (
          <div
            key={`${corner.x}:${corner.y}`}
            className="absolute -translate-1/2 rounded-xs border-primary bg-background"
            title="Redimensionner le calque"
            style={{
              ...handleStyle(HANDLE_SIZE),
              left: corner.x < 0 ? 0 : "100%",
              top: corner.y < 0 ? 0 : "100%",
              cursor: corner.x === corner.y ? "nwse-resize" : "nesw-resize",
            }}
            onPointerDown={(event) =>
              beginGesture(event, (from) => ({
                kind: "resize",
                overlay,
                from,
                corner,
              }))
            }
          />
        ))}
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-primary"
          style={{
            top: -px(ROTATE_HANDLE_GAP),
            width: px(FRAME_WIDTH),
            height: px(ROTATE_HANDLE_GAP),
          }}
        />
        <div
          className="absolute left-1/2 -translate-1/2 cursor-grab rounded-full border-primary bg-background active:cursor-grabbing"
          title="Faire pivoter le calque, par pas de 15° avec Maj"
          style={{
            ...handleStyle(ROTATE_HANDLE_SIZE),
            top: -px(ROTATE_HANDLE_GAP),
          }}
          onPointerDown={(event) =>
            beginGesture(event, (from) => ({ kind: "rotate", overlay, from }))
          }
        />
      </div>
    </ViewportPortal>
  );
}
