import { BaseEdge, Position, getBezierPath } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { CableState } from "@/canvas/cablePaths";
import { cn } from "@/lib/utils";

export type CablePathEdgeData = {
  /** A cable's link, or a dashed sighting of a device at a socket. */
  state: CableState | "sighting";
};

export type CablePathEdgeType = Edge<CablePathEdgeData, "cable-path">;

/**
 * The sides a curve leaves and reaches its ends by, from where each end lies:
 * a handle sits inside its node, so its own side says nothing.
 */
const facing = (dx: number, dy: number): [Position, Position] =>
  Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0
      ? [Position.Right, Position.Left]
      : [Position.Left, Position.Right]
    : dy >= 0
      ? [Position.Bottom, Position.Top]
      : [Position.Top, Position.Bottom];

/** One cable, or one sighting, of the shown paths (ADR 0029). */
export function CablePathEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<CablePathEdgeType>) {
  const state = data?.state ?? "unknown";
  const [sourcePosition, targetPosition] = facing(
    targetX - sourceX,
    targetY - sourceY,
  );
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={0}
        className={cn("cable-path-line", `cable-path-${state}`)}
      />
      {state === "live" ? <path d={path} className="cable-path-flow" /> : null}
    </>
  );
}

export const edgeTypes = { "cable-path": CablePathEdge };
