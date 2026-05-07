import type { Position, Size } from "@/types/map";

export const rectanglesOverlap = (
  pos1: Position,
  size1: Size,
  pos2: Position,
  size2: Size,
): boolean => {
  return !(
    pos1.x + size1.width <= pos2.x ||
    pos2.x + size2.width <= pos1.x ||
    pos1.y + size1.height <= pos2.y ||
    pos2.y + size2.height <= pos1.y
  );
};
