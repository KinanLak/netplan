import { useMemo } from "react";
import { ViewportPortal } from "@xyflow/react";
import type { DrawTool, Position, WallDraft, WallSegment } from "@/types/map";
import { WALL_COLOR_ORDER, WALL_COLOR_TONES } from "@/lib/walls";
import {
  computeMergedWallGroups,
  computeWallMaskBounds,
  getWallBlockKey,
  getWallCellRect,
  getWallCollisionRect,
} from "@/walls/gridGeometry";

interface WallOverlayProps {
  floorWalls: Array<WallSegment>;
  previewSegments: Array<WallDraft>;
  erasePreviewKeys: Array<string>;
  activeDrawTool: DrawTool;
  drawAnchor: Position | null;
  hoverSnapPoint: Position | null;
  paneHoverFillColor: string;
  paneHoverStrokeColor: string;
}

export function WallOverlay({
  floorWalls,
  previewSegments,
  erasePreviewKeys,
  activeDrawTool,
  drawAnchor,
  hoverSnapPoint,
  paneHoverFillColor,
  paneHoverStrokeColor,
}: WallOverlayProps) {
  const hasPreview = previewSegments.length > 0;

  const mergedWallGroups = useMemo(
    () =>
      computeMergedWallGroups(floorWalls).sort(
        (a, b) =>
          WALL_COLOR_ORDER.indexOf(a.color) - WALL_COLOR_ORDER.indexOf(b.color),
      ),
    [floorWalls],
  );

  const combinedMergedWallGroups = useMemo(() => {
    if (!hasPreview) {
      return mergedWallGroups;
    }

    return computeMergedWallGroups([...floorWalls, ...previewSegments]).sort(
      (a, b) =>
        WALL_COLOR_ORDER.indexOf(a.color) - WALL_COLOR_ORDER.indexOf(b.color),
    );
  }, [hasPreview, floorWalls, mergedWallGroups, previewSegments]);

  const existingPathByColor = useMemo(
    () => new Map(mergedWallGroups.map((group) => [group.color, group.path])),
    [mergedWallGroups],
  );

  const floorWallRects = useMemo(
    () =>
      floorWalls.map((wall) => ({
        key: getWallBlockKey(wall) ?? wall._id,
        rect: getWallCollisionRect(wall),
      })),
    [floorWalls],
  );

  const wallMaskBounds = useMemo(
    () => computeWallMaskBounds([...floorWalls, ...previewSegments]),
    [floorWalls, previewSegments],
  );

  const erasePreviewRects = useMemo(() => {
    if (activeDrawTool !== "wall-erase" || erasePreviewKeys.length === 0) {
      return [];
    }

    const erasePreviewKeySet = new Set(erasePreviewKeys);
    return floorWallRects.filter((item) => erasePreviewKeySet.has(item.key));
  }, [activeDrawTool, erasePreviewKeys, floorWallRects]);
  const hasErasePreview = erasePreviewRects.length > 0;
  const eraseHoverRect =
    activeDrawTool === "wall-erase" && hoverSnapPoint && !hasErasePreview
      ? getWallCellRect(hoverSnapPoint)
      : null;
  const brushHoverRect =
    activeDrawTool === "wall-brush" && hoverSnapPoint
      ? getWallCellRect(hoverSnapPoint)
      : null;

  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute inset-0">
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            {hasPreview
              ? combinedMergedWallGroups.map((group) => {
                  const existingPath = existingPathByColor.get(group.color);

                  return (
                    <mask
                      id={`wall-preview-mask-${group.color}`}
                      key={`wall-preview-mask-${group.color}`}
                      maskUnits="userSpaceOnUse"
                      x={wallMaskBounds?.x}
                      y={wallMaskBounds?.y}
                      width={wallMaskBounds?.width}
                      height={wallMaskBounds?.height}
                    >
                      <path d={group.path} fill="#808080" />
                      {existingPath ? (
                        <path d={existingPath} fill="white" />
                      ) : null}
                    </mask>
                  );
                })
              : null}
          </defs>

          {combinedMergedWallGroups.map((group) => {
            const tone = WALL_COLOR_TONES[group.color];

            return (
              <g
                key={`wall-fill-${group.color}`}
                mask={
                  hasPreview
                    ? `url(#wall-preview-mask-${group.color})`
                    : undefined
                }
              >
                <path d={group.path} fill={tone.fill} />
              </g>
            );
          })}

          {combinedMergedWallGroups.map((group) => {
            const tone = WALL_COLOR_TONES[group.color];

            return (
              <path
                key={`wall-stroke-${group.color}`}
                d={group.path}
                fill="none"
                stroke={tone.stroke}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {erasePreviewRects.map((item) => (
            <rect
              key={`erase-preview-${item.key}`}
              x={item.rect.x}
              y={item.rect.y}
              width={item.rect.width}
              height={item.rect.height}
              rx={3}
              ry={3}
              fill="rgba(220, 38, 38, 0.16)"
              stroke="rgba(220, 38, 38, 0.98)"
              strokeWidth={1.6}
              className="animate-pulse"
            />
          ))}

          {eraseHoverRect ? (
            <rect
              x={eraseHoverRect.x}
              y={eraseHoverRect.y}
              width={eraseHoverRect.width}
              height={eraseHoverRect.height}
              rx={3}
              ry={3}
              fill="rgba(220, 38, 38, 0.16)"
              stroke="rgba(220, 38, 38, 0.98)"
              strokeWidth={1.6}
              className="animate-pulse"
            />
          ) : null}

          {brushHoverRect ? (
            <rect
              x={brushHoverRect.x}
              y={brushHoverRect.y}
              width={brushHoverRect.width}
              height={brushHoverRect.height}
              rx={3}
              ry={3}
              fill={paneHoverFillColor}
              stroke={paneHoverStrokeColor}
              strokeWidth={1.6}
              className="animate-pulse"
            />
          ) : null}

          {drawAnchor && activeDrawTool !== "device" ? (
            <circle
              cx={drawAnchor.x}
              cy={drawAnchor.y}
              r={5}
              fill="rgba(15, 23, 42, 0.8)"
              stroke="#ffffff"
              strokeWidth={2}
            />
          ) : null}

          {(activeDrawTool === "wall" || activeDrawTool === "room") &&
          !drawAnchor &&
          hoverSnapPoint ? (
            <circle
              cx={hoverSnapPoint.x}
              cy={hoverSnapPoint.y}
              r={4}
              fill={paneHoverFillColor}
              stroke={paneHoverStrokeColor}
              strokeWidth={1.5}
            />
          ) : null}
        </svg>
      </div>
    </ViewportPortal>
  );
}
