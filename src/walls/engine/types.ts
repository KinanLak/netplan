import type {
  Position,
  WallColor,
  WallCommandResult,
  WallDraft,
  WallSegment,
} from "@/types/map";

export type EngineResult = WallCommandResult;

export interface AddLineCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: string;
  color: WallColor;
  start: Position;
  end: Position;
  collidesWithBlock?: (block: WallDraft) => boolean;
  generateWallId?: () => string;
}

export interface AddRoomCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: string;
  color: WallColor;
  start: Position;
  end: Position;
  collidesWithBlock?: (block: WallDraft) => boolean;
  generateWallId?: () => string;
}

export interface EraseAtPointerCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: string;
  pointer: Position;
  snappedPoint: Position;
}

export interface EraseStrokeCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: string;
  fromPointer: Position;
  fromSnappedPoint: Position;
  toPointer: Position;
  toSnappedPoint: Position;
}
