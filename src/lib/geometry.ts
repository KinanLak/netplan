import type { Device, Position, Size, WallSegment } from "@/types/map";
import { getWallRect } from "@/lib/walls";

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

export const wallCollidesWithDevices = (
  wall: Pick<WallSegment, "start" | "end">,
  devices: Array<Device>,
): boolean => {
  const wallRect = getWallRect(wall);
  return devices.some((device) =>
    rectanglesOverlap(
      { x: wallRect.x, y: wallRect.y },
      { width: wallRect.width, height: wallRect.height },
      device.position,
      device.size,
    ),
  );
};
