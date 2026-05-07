import type { Position, WallColor, WallDraft, WallSegment } from "@/types/map";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NormalizedWallPoints {
  start: Position;
  end: Position;
}

export type EraseDirection = "center" | "east" | "west" | "north" | "south";

export interface WallEraseCandidate {
  key: string;
  wall: WallSegment;
  direction: EraseDirection;
  distanceSquared: number;
}

export interface MergedWallGroup {
  color: WallColor;
  path: string;
}

export interface DirectedEdge {
  from: Position;
  to: Position;
}

export type WallShape =
  | Pick<WallSegment, "start" | "end">
  | Pick<WallDraft, "start" | "end">;

export type FloorWallShape =
  | Pick<WallSegment, "floorId" | "start" | "end">
  | Pick<WallDraft, "floorId" | "start" | "end">;

export type ColoredWallShape =
  | Pick<WallSegment, "start" | "end" | "color">
  | Pick<WallDraft, "start" | "end" | "color">;
