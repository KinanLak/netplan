import { ViewportPortal, useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useQuery } from "convex/react";
import { cablePathOf, EMPTY_PATH, floorCabling } from "@/canvas/cablePaths";
import type { PathEnd } from "@/canvas/cablePaths";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import { useHoveredDeviceId, useSelectedDeviceId } from "@/store/selectors";
import type { Device, DeviceId, Position } from "@/types/map";
import { api } from "../../../convex/_generated/api";

/**
 * The devices whose path shows when hovered or selected (ADR 0025). A switch
 * or a patch panel carries too many cables to show them unasked.
 */
const TRACED: ReadonlySet<Device["type"]> = new Set([
  "pc",
  "endpoint",
  "wall-port",
]);

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

const labelOf = (end: PathEnd): string => {
  switch (end.kind) {
    case "port":
      return end.portName;
    case "shared":
      return `${end.portName} · arrière partagé`;
    case "away":
      return `${end.deviceName} · ${end.portName} (${end.floorName ?? "non placé"})`;
    case "seen-away":
      return `Vu à ${end.socketName} (${end.floorName ?? "non placé"})`;
  }
};

/**
 * The cable path of the hovered device, or else the selected one: its
 * cables through sockets and patch panels to the switch port, drawn over the
 * floor; a dashed segment to the socket where the network last saw it; and a
 * label where the path ends or leaves the floor.
 */
export function CablePathLayer() {
  const { document } = useMapDocumentData();
  const hovered = useHoveredDeviceId();
  const selected = useSelectedDeviceId();
  const zoom = useStore((s) => s.transform[2]);
  const ends = useQuery(api.mapDocument.getFloorPathEnds, {
    floorId: document.floorId,
  });

  const targetId = hovered ?? selected;
  const target = document.devices.find((device) => device.id === targetId);
  const path =
    target && TRACED.has(target.type)
      ? cablePathOf(
          target.id,
          floorCabling(
            document.devices,
            document.ports,
            document.cables,
            ends ?? NO_ENDS,
          ),
        )
      : EMPTY_PATH;

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
  const labelsAt = Map.groupBy(path.ends, (end) => end.at);

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
      {[...labelsAt].map(([at, atEnds]) => {
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
            {atEnds.map((end) => (
              <span
                key={JSON.stringify(end)}
                className="rounded-sm border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground shadow-sm"
              >
                {labelOf(end)}
              </span>
            ))}
          </div>
        );
      })}
    </ViewportPortal>
  );
}
