import { ViewportPortal, useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import { useHoveredDeviceId } from "@/store/selectors";

/**
 * The full name of the hovered device, over its node (A17): the node itself
 * shows it in capitals, shrunk or cut to fit.
 */
export function DeviceNameTooltip() {
  const hovered = useHoveredDeviceId();
  const { document } = useMapDocumentData();
  const zoom = useStore((s) => s.transform[2]);
  const box = useStore((state: ReactFlowState) => {
    const node = hovered ? state.nodeLookup.get(hovered) : undefined;
    if (!node || node.dragging) return null;
    const { x, y } = node.internals.positionAbsolute;
    return `${x + (node.measured.width ?? 0) / 2},${y}`;
  });
  const device = document.devices.find(({ id }) => id === hovered);
  if (!device || !box) return null;
  const [left, top] = box.split(",").map(Number);
  const hostname =
    device.hostname &&
    device.hostname.toLowerCase() !== device.name.toLowerCase()
      ? device.hostname
      : null;

  return (
    <ViewportPortal>
      <div
        role="tooltip"
        className="pointer-events-none absolute z-50 w-max max-w-xs rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md"
        style={{
          left,
          top: top - 6 / zoom,
          // The tooltip keeps its size on screen whatever the zoom.
          transform: `translate(-50%, -100%) scale(${1 / zoom})`,
          transformOrigin: "bottom center",
        }}
      >
        <span className="font-medium">{device.name}</span>
        {hostname ? (
          <span className="ml-1.5 font-mono text-muted-foreground">
            {hostname}
          </span>
        ) : null}
      </div>
    </ViewportPortal>
  );
}
