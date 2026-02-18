import type { Position } from "@/types/map";
import { GRID_SIZE, WALL_GRID_OFFSET, arePositionsEqual } from "@/lib/walls";
import { Kbd } from "@/components/ui/kbd";

interface WallDebugPanelProps {
  isVisible: boolean;
  pointerPosition: Position | null;
  wallHintPoint: Position | null;
  theoreticalWallStartPoint: Position | null;
  realWallStartPoint: Position | null;
  physicalWallStartPoint: Position | null;
}

const formatNumber = (value: number): string => {
  if (Number.isInteger(value)) {
    return `${value}`;
  }

  return value.toFixed(2);
};

const formatPoint = (point: Position | null): string => {
  if (!point) {
    return "n/a";
  }

  return `${formatNumber(point.x)}, ${formatNumber(point.y)}`;
};

const formatCanvasGrid = (point: Position | null): string => {
  if (!point) {
    return "n/a";
  }

  return `${formatNumber(point.x / GRID_SIZE)}, ${formatNumber(point.y / GRID_SIZE)}`;
};

const formatWallGrid = (point: Position | null): string => {
  if (!point) {
    return "n/a";
  }

  return `${formatNumber((point.x - WALL_GRID_OFFSET) / GRID_SIZE)}, ${formatNumber((point.y - WALL_GRID_OFFSET) / GRID_SIZE)}`;
};

const isDifferentFromHint = (
  point: Position | null,
  wallHintPoint: Position | null,
): boolean => {
  if (!point || !wallHintPoint) {
    return false;
  }

  return !arePositionsEqual(point, wallHintPoint);
};

export function WallDebugPanel({
  isVisible,
  pointerPosition,
  wallHintPoint,
  theoreticalWallStartPoint,
  realWallStartPoint,
  physicalWallStartPoint,
}: WallDebugPanelProps) {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="absolute top-24 right-4 z-20 w-[25rem] rounded-md border border-border bg-card px-3 py-2 text-[11px] shadow-md">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-foreground">Debug mur (grille canvas)</p>
        <Kbd>Shift + D</Kbd>
      </div>
      <div className="space-y-1 font-mono text-muted-foreground">
        <p>
          curseur px:{" "}
          <span className="text-foreground">
            {formatPoint(pointerPosition)}
          </span>
        </p>
        <p>
          curseur grille canvas:{" "}
          <span className="text-foreground">
            {formatCanvasGrid(pointerPosition)}
          </span>
        </p>
        <p>
          curseur grille mur:{" "}
          <span className="text-foreground">
            {formatWallGrid(pointerPosition)}
          </span>
        </p>
        <p>
          hint debut mur:{" "}
          <span className="text-foreground">{formatPoint(wallHintPoint)}</span>
        </p>
        <p>
          theorique (snap):{" "}
          <span className="text-foreground">
            {formatPoint(theoreticalWallStartPoint)}
          </span>
          {isDifferentFromHint(theoreticalWallStartPoint, wallHintPoint)
            ? " (different du hint)"
            : ""}
        </p>
        <p>
          reel (dernier clic):{" "}
          <span className="text-foreground">
            {formatPoint(realWallStartPoint)}
          </span>
          {isDifferentFromHint(realWallStartPoint, wallHintPoint)
            ? " (different du hint)"
            : ""}
        </p>
        <p>
          physique (ancre active):{" "}
          <span className="text-foreground">
            {formatPoint(physicalWallStartPoint)}
          </span>
          {isDifferentFromHint(physicalWallStartPoint, wallHintPoint)
            ? " (different du hint)"
            : ""}
        </p>
      </div>
    </div>
  );
}
