import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { useViewport } from "@xyflow/react";
import type { FloorId } from "@/types/map";
import { colorForHue } from "@/lib/identity";
import type { Identity } from "@/lib/identity";
import { api } from "../../convex/_generated/api";

const STALE_AFTER_MS = 30_000;

interface PresenceCursorsProps {
  identity: Identity | null;
  floorId: FloorId | null;
}

export const PresenceCursors = ({
  identity,
  floorId,
}: PresenceCursorsProps) => {
  const { x: panX, y: panY, zoom } = useViewport();
  const [now, setNow] = useState(() => Date.now());
  const presences =
    useQuery(api.presences.listForFloor, floorId ? { floorId } : "skip") ?? [];

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!floorId) return null;

  const ownSessionId = identity?.sessionId ?? null;
  const cutoff = now - STALE_AFTER_MS;
  const others = presences.filter(
    (presence) =>
      presence.sessionId !== ownSessionId &&
      presence.cursor &&
      presence.updatedAt >= cutoff,
  );

  if (others.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {others.map((presence) => {
        if (presence.editing?.kind !== "device.drag") return null;
        const preview = presence.editing.previewPosition;
        const screenX = preview.x * zoom + panX;
        const screenY = preview.y * zoom + panY;
        const stroke = colorForHue(presence.colorHue, "stroke");
        const fill = colorForHue(presence.colorHue, "fill");
        return (
          <div
            key={`${presence.sessionId}:drag-preview`}
            className="absolute h-20 w-20 rounded-lg border-2 opacity-60 shadow-lg"
            style={{
              transform: `translate(${screenX}px, ${screenY}px)`,
              borderColor: stroke,
              backgroundColor: fill,
              transition: "transform 60ms linear",
            }}
          />
        );
      })}
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
            key={presence.sessionId}
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
            {presence.editing?.kind === "device.drag" ? (
              <span className="absolute top-8 left-4 rounded bg-card px-1.5 py-0.5 text-xs font-medium whitespace-nowrap text-foreground shadow">
                déplace un équipement
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
