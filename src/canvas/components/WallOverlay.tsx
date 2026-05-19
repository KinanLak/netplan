import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ViewportPortal } from "@xyflow/react";
import type { DrawTool, Position, WallDraft, WallSegment } from "@/types/map";
import { WALL_COLOR_ORDER, WALL_COLOR_TONES } from "@/lib/walls";
import {
  computeMergedWallGroups,
  computeWallRectUnionPath,
  computeWallMaskBounds,
  getWallBlockKey,
  getWallCellRect,
  getWallCollisionRect,
  getWallEraserRect,
} from "@/walls/gridGeometry";
import type { Rect } from "@/walls/gridGeometry";

const WALL_TOOL_GHOST_ANIMATION_MS = 120;

const arePositionsEqual = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const areRectsEqual = (a: Rect, b: Rect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const interpolatePosition = (
  from: Position,
  to: Position,
  t: number,
): Position => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const interpolateRect = (from: Rect, to: Rect, t: number): Rect => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
  width: from.width + (to.width - from.width) * t,
  height: from.height + (to.height - from.height) * t,
});

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

interface FadingPath {
  key: string;
  path: string;
}

function useFadingPreviousPath(path: string | null): FadingPath | null {
  const [fadingPath, setFadingPath] = useState<FadingPath | null>(null);
  const latestPathRef = useRef<FadingPath | null>(
    path ? { key: path, path } : null,
  );

  useEffect(() => {
    const nextPath = path ? { key: path, path } : null;
    const previousPath = latestPathRef.current;

    if (previousPath?.key === nextPath?.key) {
      return;
    }

    latestPathRef.current = nextPath;

    let frame: number | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    if (previousPath) {
      frame = window.requestAnimationFrame(() => {
        setFadingPath(previousPath);
        timeout = setTimeout(
          () => setFadingPath(null),
          WALL_TOOL_GHOST_ANIMATION_MS,
        );
      });
    }

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      if (timeout !== null) {
        clearTimeout(timeout);
      }
    };
  }, [path]);

  return fadingPath;
}

function useAnimatedPosition(target: Position | null): Position | null {
  const [animatedPosition, setAnimatedPosition] = useState<Position | null>(
    target,
  );
  const animatedPositionRef = useRef<Position | null>(target);
  const frameRef = useRef<number | null>(null);
  const targetX = target?.x ?? null;
  const targetY = target?.y ?? null;

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const nextTarget =
      targetX === null || targetY === null ? null : { x: targetX, y: targetY };
    const from = animatedPositionRef.current;

    const animate = (now: number) => {
      if (!nextTarget) {
        animatedPositionRef.current = null;
        setAnimatedPosition(null);
        frameRef.current = null;
        return;
      }

      if (!from || arePositionsEqual(from, nextTarget)) {
        animatedPositionRef.current = nextTarget;
        setAnimatedPosition(nextTarget);
        frameRef.current = null;
        return;
      }

      const rawProgress = Math.min(
        (now - startedAt) / WALL_TOOL_GHOST_ANIMATION_MS,
        1,
      );
      const nextPosition = interpolatePosition(
        from,
        nextTarget,
        easeOutCubic(rawProgress),
      );
      animatedPositionRef.current = nextPosition;
      setAnimatedPosition(nextPosition);

      if (rawProgress < 1) {
        frameRef.current = window.requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    };

    const startedAt = performance.now();
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [targetX, targetY]);

  return animatedPosition;
}

function useAnimatedRect(target: Rect | null): Rect | null {
  const [animatedRect, setAnimatedRect] = useState<Rect | null>(target);
  const animatedRectRef = useRef<Rect | null>(target);
  const frameRef = useRef<number | null>(null);
  const targetX = target?.x ?? null;
  const targetY = target?.y ?? null;
  const targetWidth = target?.width ?? null;
  const targetHeight = target?.height ?? null;

  useEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const nextTarget =
      targetX === null ||
      targetY === null ||
      targetWidth === null ||
      targetHeight === null
        ? null
        : {
            x: targetX,
            y: targetY,
            width: targetWidth,
            height: targetHeight,
          };

    const from = animatedRectRef.current;

    const animate = (now: number) => {
      if (!nextTarget) {
        animatedRectRef.current = null;
        setAnimatedRect(null);
        frameRef.current = null;
        return;
      }

      if (!from || areRectsEqual(from, nextTarget)) {
        animatedRectRef.current = nextTarget;
        setAnimatedRect(nextTarget);
        frameRef.current = null;
        return;
      }

      const rawProgress = Math.min(
        (now - startedAt) / WALL_TOOL_GHOST_ANIMATION_MS,
        1,
      );
      const nextRect = interpolateRect(
        from,
        nextTarget,
        easeOutCubic(rawProgress),
      );
      animatedRectRef.current = nextRect;
      setAnimatedRect(nextRect);

      if (rawProgress < 1) {
        frameRef.current = window.requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    };

    const startedAt = performance.now();
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [targetHeight, targetWidth, targetX, targetY]);

  return animatedRect;
}

interface WallOverlayProps {
  floorWalls: Array<WallSegment>;
  previewSegments: Array<WallDraft>;
  erasePreviewKeys: Array<string>;
  erasePreviewPointer: Position | null;
  wallEraserSize: number;
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
  erasePreviewPointer,
  wallEraserSize,
  activeDrawTool,
  drawAnchor,
  hoverSnapPoint,
  paneHoverFillColor,
  paneHoverStrokeColor,
}: WallOverlayProps) {
  const stripePatternId = `wall-erase-stripes-${useId().replace(/:/g, "")}`;
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
        key: getWallBlockKey(wall) ?? wall.id,
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
  const erasePreviewPath = useMemo(
    () =>
      erasePreviewRects.length > 0
        ? computeWallRectUnionPath(erasePreviewRects.map((item) => item.rect))
        : null,
    [erasePreviewRects],
  );
  const fadingErasePreviewPath = useFadingPreviousPath(erasePreviewPath);
  const eraseGhostRect =
    activeDrawTool === "wall-erase" && erasePreviewPointer
      ? getWallEraserRect(erasePreviewPointer, wallEraserSize)
      : null;
  const animatedEraseGhostRect = useAnimatedRect(eraseGhostRect);
  const eraseGhostPath = useMemo(
    () =>
      animatedEraseGhostRect
        ? computeWallRectUnionPath([animatedEraseGhostRect])
        : null,
    [animatedEraseGhostRect],
  );
  const brushHoverRect =
    activeDrawTool === "wall-brush" && hoverSnapPoint
      ? getWallCellRect(hoverSnapPoint)
      : null;
  const animatedBrushHoverRect = useAnimatedRect(brushHoverRect);
  const brushHoverPath = useMemo(
    () =>
      animatedBrushHoverRect
        ? computeWallRectUnionPath([animatedBrushHoverRect])
        : null,
    [animatedBrushHoverRect],
  );
  const drawHoverPoint =
    (activeDrawTool === "wall" || activeDrawTool === "room") &&
    !drawAnchor &&
    hoverSnapPoint
      ? hoverSnapPoint
      : null;
  const animatedDrawHoverPoint = useAnimatedPosition(drawHoverPoint);

  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute inset-0">
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <pattern
              id={stripePatternId}
              width={8}
              height={8}
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-45)"
            >
              <rect width={8} height={8} fill="rgba(220, 38, 38, 0.08)" />
              <rect width={3} height={8} fill="rgba(220, 38, 38, 0.34)" />
            </pattern>

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

          {eraseGhostPath ? (
            <path
              d={eraseGhostPath}
              fill="rgba(220, 38, 38, 0.1)"
              stroke="rgba(220, 38, 38, 0.98)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {fadingErasePreviewPath ? (
            <path
              key={`erase-preview-fading-${fadingErasePreviewPath.key}`}
              d={fadingErasePreviewPath.path}
              fill={`url(#${stripePatternId})`}
              stroke="rgba(220, 38, 38, 0.98)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <animate
                attributeName="opacity"
                from={0.9}
                to={0}
                dur={`${WALL_TOOL_GHOST_ANIMATION_MS}ms`}
                fill="freeze"
              />
            </path>
          ) : null}

          {erasePreviewPath ? (
            <path
              key={`erase-preview-${erasePreviewPath}`}
              d={erasePreviewPath}
              fill={`url(#${stripePatternId})`}
              stroke="rgba(220, 38, 38, 0.98)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            >
              <animate
                attributeName="opacity"
                from={0.35}
                to={1}
                dur={`${WALL_TOOL_GHOST_ANIMATION_MS}ms`}
                fill="freeze"
              />
            </path>
          ) : null}

          {brushHoverPath ? (
            <path
              d={brushHoverPath}
              fill={paneHoverFillColor}
              stroke={paneHoverStrokeColor}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
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

          {animatedDrawHoverPoint ? (
            <circle
              cx={animatedDrawHoverPoint.x}
              cy={animatedDrawHoverPoint.y}
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
