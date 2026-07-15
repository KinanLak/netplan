import { rectanglesOverlap } from "@/lib/geometry";
import type { Position, Size } from "@/types/map";

export interface InventoryPlacementItem {
  id: string;
  size: Size;
}

export interface InventoryPlacement extends InventoryPlacementItem {
  position: Position;
}

const spiralOffset = (index: number): Position => {
  if (index === 0) return { x: 0, y: 0 };
  let radius = 1;
  let firstIndex = 1;
  while (index >= firstIndex + 8 * radius) {
    firstIndex += 8 * radius;
    radius += 1;
  }
  const offset = index - firstIndex;
  const sideLength = 2 * radius;
  if (offset < sideLength) {
    return { x: -radius + offset, y: -radius };
  }
  if (offset < sideLength * 2) {
    return { x: radius, y: -radius + (offset - sideLength) };
  }
  if (offset < sideLength * 3) {
    return { x: radius - (offset - sideLength * 2), y: radius };
  }
  return {
    x: -radius,
    y: radius - (offset - sideLength * 3),
  };
};

export const layoutInventoryGrid = (input: {
  items: Array<InventoryPlacementItem>;
  center: Position;
  isBlocked: (item: InventoryPlacementItem, position: Position) => boolean;
  gap?: number;
}): Array<InventoryPlacement> => {
  if (input.items.length === 0) return [];
  const gap = input.gap ?? 24;
  const cellWidth =
    Math.max(...input.items.map((item) => item.size.width)) + gap;
  const cellHeight =
    Math.max(...input.items.map((item) => item.size.height)) + gap;
  const columns = Math.max(1, Math.ceil(Math.sqrt(input.items.length)));
  const initialRows = Math.ceil(input.items.length / columns);
  const startX = input.center.x - (columns * cellWidth - gap) / 2;
  const startY = input.center.y - (initialRows * cellHeight - gap) / 2;
  const placed: Array<InventoryPlacement> = [];

  input.items.forEach((item, itemIndex) => {
    let position: Position | null = null;
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
      const column = itemIndex % columns;
      const row = Math.floor(itemIndex / columns);
      const offset = spiralOffset(attempt);
      const candidate = {
        x:
          startX +
          (column + offset.x) * cellWidth +
          (cellWidth - gap - item.size.width) / 2,
        y:
          startY +
          (row + offset.y) * cellHeight +
          (cellHeight - gap - item.size.height) / 2,
      };
      const overlapsNewDevice = placed.some((other) =>
        rectanglesOverlap(candidate, item.size, other.position, other.size),
      );
      if (!overlapsNewDevice && !input.isBlocked(item, candidate)) {
        position = candidate;
        break;
      }
    }
    if (position) placed.push({ ...item, position });
  });
  return placed;
};
