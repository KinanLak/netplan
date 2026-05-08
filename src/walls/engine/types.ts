import type { Id } from "../../../convex/_generated/dataModel";
import type {
  FloorId,
  Position,
  WallColor,
  WallCommandResult,
  WallDraft,
  WallSegment,
} from "@/types/map";

export type EngineResult = WallCommandResult;

export interface AddLineCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  color: WallColor;
  start: Position;
  end: Position;
  collidesWithBlock?: (block: WallDraft) => boolean;
  generateWallId?: () => Id<"walls">;
}

export interface AddRoomCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  color: WallColor;
  start: Position;
  end: Position;
  collidesWithBlock?: (block: WallDraft) => boolean;
  generateWallId?: () => Id<"walls">;
}

export interface EraseAtPointerCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  pointer: Position;
  snappedPoint: Position;
}

export interface EraseStrokeCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  fromPointer: Position;
  fromSnappedPoint: Position;
  toPointer: Position;
  toSnappedPoint: Position;
}
