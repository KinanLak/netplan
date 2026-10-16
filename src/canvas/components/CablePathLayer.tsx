import { ViewportPortal, useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useQuery } from "convex/react";
import {
  TRACED_ON_HOVER,
  cablePathOf,
  endLabels,
  floorCabling,
  mergedPaths,
} from "@/canvas/cablePaths";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import {
  useHoveredDeviceId,
  useSelectedDeviceId,
  useShownCablesDeviceId,
} from "@/store/selectors";
import type { DeviceId, Position } from "@/types/map";
import { api } from "../../../convex/_generated/api";

const NO_ENDS = { seenAt: [], farEnds: [] };

type Box = Position & { width: number; height: number };

/**
 * Where React Flow draws each device, so a path follows a device while it
 * is dragged, before the move reaches the document.
 */
const useBoxes = (ids: ReadonlyArray<DeviceId>) =>
  useStore(
    (state: ReactFlowState) => {
      const boxes = new Map<DeviceId, Box>();
      for (const id of ids) {
        const node = state.nodeLookup.get(id);
        if (!node) continue;
        boxes.set(id, {
          ...node.internals.positionAbsolute,
          width: node.measured.width ?? node.width ?? 0,
          height: node.measured.height ?? node.height ?? 0,
        });
      }
      return boxes;
    },
    (a, b) =>
      a.size === b.size &&
      [...a].every(([id, box]) => {
        const other = b.get(id);
        return (
          other?.x === box.x &&
          other.y === box.y &&
          other.width === box.width &&
          other.height === box.height
        );
      }),
  );

const centreOf = (box: Box): Position => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
});

/**
 * The cable path of the hovered device, or else the selected one, together
 * with the paths of the switch or patch panel whose cables were asked for
 * (ADR 0025): cables through sockets and patch panels to the switch port,
 * drawn over the floor; a dashed segment to the socket where the network
 * last saw a device; and a label where a path ends or leaves the floor.
 */
export function CablePathLayer() {
  const { document } = useMapDocumentData();
  const hovered = useHoveredDeviceId();
  const selected = useSelectedDeviceId();
  const zoom = useStore((s) => s.transform[2]);
  const ends = useQuery(api.mapDocument.getFloorPathEnds, {
    floorId: document.floorId,
  });

  const shown = useShownCablesDeviceId();

  const targetId = hovered ?? selected;
  const target = document.devices.find((device) => device.id === targetId);
  const traced = [
    ...(target && TRACED_ON_HOVER.has(target.type) ? [target.id] : []),
    ...(shown ? [shown] : []),
  ];
  const floor =
    traced.length > 0
      ? floorCabling(
          document.devices,
          document.ports,
          document.cables,
          ends ?? NO_ENDS,
        )
      : null;
  const path = mergedPaths(
    floor ? traced.map((deviceId) => cablePathOf(deviceId, floor)) : [],
  );

  const ids = [
    ...path.cables.flatMap(({ from, to }) => [from, to]),
    ...path.sightings.flatMap(({ deviceId, socketId }) => [deviceId, socketId]),
    ...path.ends.map(({ at }) => at),
  ];
  const boxes = useBoxes(ids);
  if (ids.length === 0) return null;

  const segment = (from: DeviceId, to: DeviceId) => {
    const a = boxes.get(from);
    const b = boxes.get(to);
    if (!a || !b) return null;
    return { a: centreOf(a), b: centreOf(b) };
  };

  // Labels on one device stack downwards from under it.
  const labelsAt = endLabels(path.ends);

  return (
    <ViewportPortal>
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        data-testid="cable-path"
      >
        {path.cables.map((cable) => {
          const line = segment(cable.from, cable.to);
          if (!line) return null;
          return (
            <line
              key={cable.id}
              x1={line.a.x}
              y1={line.a.y}
              x2={line.b.x}
              y2={line.b.y}
              className="stroke-primary"
              strokeWidth={2.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
        {path.sightings.map((sighting) => {
          const line = segment(sighting.deviceId, sighting.socketId);
          if (!line) return null;
          return (
            <line
              key={sighting.deviceId}
              x1={line.a.x}
              y1={line.a.y}
              x2={line.b.x}
              y2={line.b.y}
              className="stroke-muted-foreground"
              strokeWidth={2}
              strokeDasharray="6 5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </svg>
      {[...labelsAt].map(([at, labels]) => {
        const box = boxes.get(at);
        if (!box) return null;
        return (
          <div
            key={at}
            className="pointer-events-none absolute flex flex-col items-center gap-0.5"
            style={{
              left: box.x + box.width / 2,
              top: box.y + box.height + 4,
              // The labels keep their size on screen whatever the zoom.
              transform: `translateX(-50%) scale(${1 / zoom})`,
              transformOrigin: "top center",
            }}
          >
            {labels.map((label) => (
              <span
                key={label}
                className="rounded-sm border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
              >
                {label}
              </span>
            ))}
          </div>
        );
      })}
    </ViewportPortal>
  );
}
