import type {
  FloorId,
  Position,
  WallColor,
  WallCommandResult,
  WallDraft,
  WallId,
  WallSegment,
} from "@/types/map";
import type { WallEraseIndex } from "@/walls/gridGeometry/erase";

export type EngineResult = WallCommandResult;

export interface AddLineCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  color: WallColor;
  start: Position;
  end: Position;
  collidesWithBlock?: (block: WallDraft) => boolean;
  generateWallId: () => WallId;
}

export interface AddRoomCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  color: WallColor;
  start: Position;
  end: Position;
  collidesWithBlock?: (block: WallDraft) => boolean;
  generateWallId: () => WallId;
}

export interface EraseAtPointerCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  pointer: Position;
  snappedPoint: Position;
  eraserSize: number;
  /** Prebuilt cell index for the floor's walls; built on demand otherwise. */
  eraseIndex?: WallEraseIndex;
}

export interface EraseStrokeCommandInput {
  walls: ReadonlyArray<WallSegment>;
  floorId: FloorId;
  fromPointer: Position;
  fromSnappedPoint: Position;
  toPointer: Position;
  toSnappedPoint: Position;
  eraserSize: number;
  /** Prebuilt cell index for the floor's walls; built on demand otherwise. */
  eraseIndex?: WallEraseIndex;
}
