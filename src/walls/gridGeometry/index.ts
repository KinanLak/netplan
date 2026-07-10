export type { MergedWallGroup, Rect, WallEraseCandidate } from "./types";

export {
  computeWallMaskBounds,
  getWallBlockKey,
  getWallCellRect,
  getWallCollisionRect,
  snapPositionToWallGrid,
  wallCollidesWithDevices,
  WALL_GRID_OFFSET,
} from "./cells";

export {
  getWallEraserRect,
  resolveWallEraseCandidate,
  resolveWallEraseCandidates,
} from "./erase";

export {
  computeMergedWallGroups,
  computeSingleWallPath,
  computeWallRectUnionPath,
  computeWallUnionPath,
} from "./render";
