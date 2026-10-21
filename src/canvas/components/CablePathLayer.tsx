import { ViewportPortal, useStore } from "@xyflow/react";
import type { ReactFlowState } from "@xyflow/react";
import { useQuery } from "convex/react";
import {
  LABEL_GAP,
  TRACED_ON_HOVER,
  cablePathOf,
  endLabels,
  floorCabling,
  labelPlacement,
  mergedPaths,
  pathEdges,
} from "@/canvas/cablePaths";
import type { PathEnd } from "@/canvas/cablePaths";
import type { CablePathEdgeType } from "@/canvas/edges/CablePathEdge";
import { useMapDocumentData } from "@/map-session/useMapDocument";
import {
  useHoveredDeviceId,
  useSelectedDeviceId,
  useShownCablesDeviceId,
} from "@/store/selectors";
import { api } from "../../../convex/_generated/api";

const NO_ENDS = { seenAt: [], farEnds: [] };
const NO_PATHS = { edges: [], ends: [] };

/**
 * The cable path of the hovered device, or else the selected one, together
 * with the paths of the switch or patch panel whose cables were asked for
 * (ADR 0025), as React Flow edges (ADR 0029): cables through sockets and
 * patch panels to the switch port, and a dashed segment to the socket where
 * the network last saw a device.
 */
export function useShownCablePaths(): {
  edges: Array<CablePathEdgeType>;
  ends: Array<PathEnd>;
} {
  const { document } = useMapDocumentData();
  const hovered = useHoveredDeviceId();
  const selected = useSelectedDeviceId();
  const shown = useShownCablesDeviceId();
  const ends = useQuery(api.mapDocument.getFloorPathEnds, {
    floorId: document.floorId,
  });

  const targetId = hovered ?? selected;
  const target = document.devices.find((device) => device.id === targetId);
  const traced = [
    ...(target && TRACED_ON_HOVER.has(target.type) ? [target.id] : []),
    ...(shown ? [shown] : []),
  ];
  if (traced.length === 0) return NO_PATHS;

  const floor = floorCabling(
    document.devices,
    document.ports,
    document.cables,
    ends ?? NO_ENDS,
  );
  const path = mergedPaths(traced.map((id) => cablePathOf(id, floor)));
  return {
    edges: pathEdges(path, floor).map(
      ({ sourceHandle, targetHandle, state, ...edge }) => ({
        ...edge,
        type: "cable-path",
        sourceHandle,
        targetHandle,
        data: { state },
        className: "cable-path",
        selectable: false,
        focusable: false,
        deletable: false,
        // The path is a picture of the drawer's connections, not content.
        domAttributes: { "aria-hidden": true },
      }),
    ),
    ends: path.ends,
  };
}

type Box = { x: number; y: number; width: number; height: number };

const boxesOf = (state: ReactFlowState) =>
  [...state.nodeLookup.values()].map((node) => ({
    id: node.id,
    x: node.internals.positionAbsolute.x,
    y: node.internals.positionAbsolute.y,
    width: node.measured.width ?? node.width ?? 0,
    height: node.measured.height ?? node.height ?? 0,
  }));

const sameBoxes = (
  a: ReturnType<typeof boxesOf>,
  b: ReturnType<typeof boxesOf>,
) =>
  a.length === b.length &&
  a.every((box, index) => {
    const other = b[index];
    return (
      box.id === other.id &&
      box.x === other.x &&
      box.y === other.y &&
      box.width === other.width &&
      box.height === other.height
    );
  });

// The labels' text-xs: about 7 px a character, 20 px a line, on screen.
const CHAR_WIDTH = 7;
const LINE_HEIGHT = 20;
const LABEL_PADDING = 14;

/**
 * A label where a path ends or leaves the floor, beside the device it ends
 * on (ADR 0029), shown only where it covers no other device.
 */
export function CablePathLabels({ ends }: { ends: ReadonlyArray<PathEnd> }) {
  const zoom = useStore((s) => s.transform[2]);
  const boxes = useStore(boxesOf, sameBoxes);
  if (ends.length === 0) return null;
  const boxById = new Map<string, Box>(boxes.map((box) => [box.id, box]));

  return (
    <ViewportPortal>
      {[...endLabels(ends)].map(([at, labels]) => {
        const box = boxById.get(at);
        if (!box) return null;
        const size = {
          width:
            (Math.max(...labels.map((label) => label.length)) * CHAR_WIDTH +
              LABEL_PADDING) /
            zoom,
          height: (labels.length * LINE_HEIGHT) / zoom,
        };
        const placement = labelPlacement(
          box,
          size,
          boxes.filter((other) => other.id !== at),
        );
        if (!placement) return null;
        return (
          <div
            key={at}
            data-testid="cable-path-label"
            className="pointer-events-none absolute flex flex-col items-center gap-0.5"
            style={{
              left: box.x + box.width / 2,
              top:
                placement === "below"
                  ? box.y + box.height + LABEL_GAP
                  : box.y - LABEL_GAP,
              // The labels keep their size on screen whatever the zoom.
              transform: `translate(-50%, ${placement === "below" ? 0 : -100}%) scale(${1 / zoom})`,
              transformOrigin:
                placement === "below" ? "top center" : "bottom center",
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
