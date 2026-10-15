import { ViewportPortal } from "@xyflow/react";
import { useQuery } from "convex/react";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import { useIsOverlayHidden } from "@/store/selectors";
import { api } from "../../convex/_generated/api";

/**
 * The floor's calque, drawn in plan coordinates under the walls and devices.
 * It never takes the pointer: walls are drawn over it as on an empty floor.
 */
export function FloorOverlayLayer() {
  const { document } = useMapDocumentData();
  const isHidden = useIsOverlayHidden();
  const overlay =
    document.overlay?.floorId === document.floorId ? document.overlay : null;
  const image = useQuery(
    api.floorOverlays.imageUrl,
    overlay ? { fileId: overlay.fileId } : "skip",
  );

  if (!overlay || !image || isHidden) return null;

  const { center, scale, rotation } = overlay;
  return (
    <ViewportPortal>
      <img
        src={image.url}
        alt=""
        draggable={false}
        decoding="async"
        data-testid="floor-overlay"
        className="pointer-events-none absolute top-0 left-0 max-w-none select-none"
        style={{
          width: overlay.imageWidth,
          height: overlay.imageHeight,
          opacity: overlay.opacity,
          // The viewport is a stacking context: -1 paints under nodes and walls.
          zIndex: -1,
          transformOrigin: "0 0",
          transform: `translate(${center.x}px, ${center.y}px) rotate(${rotation}deg) scale(${scale}) translate(-50%, -50%)`,
        }}
      />
    </ViewportPortal>
  );
}
