import { describe, expect, it } from "bun:test";
import { crossesRect, spotNextToSocket } from "./socketPlacement";
import type { FloorId } from "@/types/map";

const wall = { x: 0, y: 190, width: 400, height: 20 };

describe("crossesRect", () => {
  it("tells a segment through a wall from one beside it", () => {
    expect(crossesRect({ x: 200, y: 170 }, { x: 200, y: 250 }, wall)).toBe(
      true,
    );
    expect(crossesRect({ x: 200, y: 170 }, { x: 300, y: 100 }, wall)).toBe(
      false,
    );
    expect(crossesRect({ x: 380, y: 100 }, { x: 500, y: 300 }, wall)).toBe(
      false,
    );
    // Down the seam between two wall cells.
    const cells = [240, 260].map((x) => ({ x, y: 640, width: 20, height: 20 }));
    expect(
      cells.map((cell) =>
        crossesRect({ x: 260, y: 620 }, { x: 260, y: 700 }, cell),
      ),
    ).toEqual([true, true]);
  });
});

describe("spotNextToSocket", () => {
  const size = { width: 80, height: 80 };
  const socket = {
    position: { x: 180, y: 150 },
    size: { width: 40, height: 40 },
  };
  // Desks on both sides of the socket, against the room's bottom wall.
  const others = [
    { position: { x: 80, y: 110 }, size },
    { position: { x: 220, y: 110 }, size },
  ];
  const overlaps = (
    a: { x: number; y: number },
    b: { position: { x: number; y: number }; size: typeof size },
  ) =>
    a.x < b.position.x + b.size.width &&
    b.position.x < a.x + size.width &&
    a.y < b.position.y + b.size.height &&
    b.position.y < a.y + size.height;

  it("stays in the socket's room, clear of what is there", () => {
    const spot = spotNextToSocket({
      floorId: "floor:test" as FloorId,
      socket,
      size,
      others: [...others, socket],
      walls: [wall],
    });
    if (!spot) throw new Error("expected a spot");
    // Nearer still, under the wall, is the next room.
    expect(spot.y + size.height).toBeLessThanOrEqual(wall.y);
    for (const box of [...others, socket]) {
      expect(overlaps(spot, box)).toBe(false);
    }
  });

  it("finds nothing when the socket's side is full", () => {
    expect(
      spotNextToSocket({
        floorId: "floor:test" as FloorId,
        socket,
        size,
        others: [
          {
            position: { x: -1000, y: -1000 },
            size: { width: 3000, height: 1190 },
          },
        ],
        walls: [wall],
      }),
    ).toBeNull();
  });
});
