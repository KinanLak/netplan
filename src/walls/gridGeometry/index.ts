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

export { resolveWallEraseCandidate } from "./erase";

export { computeMergedWallGroups, computeSingleWallPath } from "./render";
