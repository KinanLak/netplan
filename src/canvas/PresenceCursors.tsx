import { useQuery } from "convex/react";
import { useViewport } from "@xyflow/react";
import type { FloorId } from "@/types/map";
import { colorForHue } from "@/lib/identity";
import type { Identity } from "@/lib/identity";
import { api } from "../../convex/_generated/api";

interface PresenceCursorsProps {
  identity: Identity | null;
  floorId: FloorId | null;
}

export const PresenceCursors = ({
  identity,
  floorId,
}: PresenceCursorsProps) => {
  const { x: panX, y: panY, zoom } = useViewport();
  const presences =
    useQuery(api.presences.listForFloor, floorId ? { floorId } : "skip") ?? [];

  if (!floorId) return null;

  const ownSessionId = identity?.sessionId ?? null;
  const others = presences.filter(
    (presence) => presence.sessionId !== ownSessionId && presence.cursor,
  );

  if (others.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {others.map((presence) => {
        const cursor = presence.cursor;
        if (!cursor) return null;
        const screenX = cursor.x * zoom + panX;
        const screenY = cursor.y * zoom + panY;
        const fill = colorForHue(presence.colorHue, "fill");
        const stroke = colorForHue(presence.colorHue, "stroke");
        const labelBg = colorForHue(presence.colorHue, "label");
        return (
          <div
            key={presence._id}
            className="absolute"
            style={{
              transform: `translate(${screenX}px, ${screenY}px)`,
              transition: "transform 60ms linear",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20">
              <path
                d="M 2 2 L 2 16 L 6 12 L 9 18 L 11 17 L 8 11 L 14 11 Z"
                fill={fill}
                stroke={stroke}
                strokeWidth="1"
              />
            </svg>
            <span
              className="absolute top-4 left-4 rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-white"
              style={{ backgroundColor: labelBg }}
            >
              {presence.displayName}
            </span>
          </div>
        );
      })}
    </div>
  );
};
