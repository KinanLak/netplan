import { ViewportPortal } from "@xyflow/react";
import type { BlockedSpot } from "@/canvas/hooks/useCanvasDeviceNodes";

/**
 * The spot under the cursor that a dragged device cannot take (A13, A22),
 * outlined while the device waits at the nearest free one. No message.
 */
export function BlockedSpots({ spots }: { spots: ReadonlyArray<BlockedSpot> }) {
  if (spots.length === 0) return null;
  return (
    <ViewportPortal>
      {spots.map((spot) => (
        <div
          key={spot.deviceId}
          data-testid="blocked-spot"
          className="pointer-events-none absolute rounded-sm border-2 border-dashed border-destructive"
          style={{
            left: spot.position.x,
            top: spot.position.y,
            width: spot.size.width,
            height: spot.size.height,
          }}
        />
      ))}
    </ViewportPortal>
  );
}
