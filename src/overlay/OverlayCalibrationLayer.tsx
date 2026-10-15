import type { MouseEvent } from "react";
import { ViewportPortal, useReactFlow, useStore } from "@xyflow/react";
import { useMapStore } from "@/store/useMapStore";
import type { FloorOverlay, OverlayCalibration } from "@/types/map";
import { imageToPlan, isInsideImage, planToImage } from "./calibration";

/** Marker sizes in screen pixels, whatever the zoom. */
const POINT_SIZE = 12;
const LINE_WIDTH = 2;
const FRAME_WIDTH = 1.5;

interface OverlayCalibrationLayerProps {
  overlay: FloorOverlay;
  calibration: OverlayCalibration;
}

/**
 * Picks the two calibration points on the calque. A click places a point; a
 * drag still pans, so the user can zoom in on each end of a known length.
 */
export function OverlayCalibrationLayer({
  overlay,
  calibration,
}: OverlayCalibrationLayerProps) {
  const setOverlayCalibration = useMapStore((s) => s.setOverlayCalibration);
  const { screenToFlowPosition } = useReactFlow();
  const zoom = useStore((s) => s.transform[2]);
  const px = (size: number) => size / zoom;

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    const pixel = planToImage(
      overlay,
      screenToFlowPosition(
        { x: event.clientX, y: event.clientY },
        { snapToGrid: false },
      ),
    );
    if (!isInsideImage(overlay, pixel)) return;
    // A third click starts over from that point.
    const points =
      calibration.points.length < 2 ? [...calibration.points, pixel] : [pixel];
    setOverlayCalibration({ fileId: overlay.fileId, points });
  };

  const marks = calibration.points.map((pixel) => imageToPlan(overlay, pixel));
  const a = marks.at(0);
  const b = marks.at(1);

  return (
    <ViewportPortal>
      <div
        className="pointer-events-auto absolute top-0 left-0 cursor-crosshair border-dashed border-primary"
        data-testid="floor-overlay-calibration"
        style={{
          width: overlay.imageWidth * overlay.scale,
          height: overlay.imageHeight * overlay.scale,
          borderWidth: px(FRAME_WIDTH),
          zIndex: 1001,
          transformOrigin: "0 0",
          transform: `translate(${overlay.center.x}px, ${overlay.center.y}px) rotate(${overlay.rotation}deg) translate(-50%, -50%)`,
        }}
        onClick={handleClick}
      />
      {a && b ? (
        <div
          className="pointer-events-none absolute top-0 left-0 bg-primary"
          style={{
            width: Math.hypot(b.x - a.x, b.y - a.y),
            height: px(LINE_WIDTH),
            zIndex: 1002,
            transformOrigin: "0 50%",
            transform: `translate(${a.x}px, ${a.y - px(LINE_WIDTH) / 2}px) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`,
          }}
        />
      ) : null}
      {marks.map((point, index) => (
        <div
          key={index}
          className="pointer-events-none absolute top-0 left-0 rounded-full border-primary bg-background"
          style={{
            width: px(POINT_SIZE),
            height: px(POINT_SIZE),
            borderWidth: px(LINE_WIDTH),
            zIndex: 1003,
            transform: `translate(${point.x}px, ${point.y}px) translate(-50%, -50%)`,
          }}
        />
      ))}
    </ViewportPortal>
  );
}
