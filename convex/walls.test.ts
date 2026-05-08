import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

async function freshFloor(t: ReturnType<typeof convexTest>) {
  const buildingId = await t.mutation(api.buildings.create, { name: "Test" });
  const floors = await t.query(api.floors.listForBuilding, { buildingId });
  return floors[0]._id;
}

describe("walls", () => {
  it("addStroke inserts each segment and returns ids in order", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    const segments = [
      { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, color: "sand" as const },
      { start: { x: 10, y: 0 }, end: { x: 20, y: 0 }, color: "sand" as const },
    ];
    const ids = await t.mutation(api.walls.addStroke, { floorId, segments });
    expect(ids).toHaveLength(2);

    const list = await t.query(api.walls.listForFloor, { floorId });
    expect(list.map((w) => [w.start.x, w.end.x])).toEqual([
      [0, 10],
      [10, 20],
    ]);
  });

  it("listForFloor isolates by floor", async () => {
    const t = convexTest(schema, modules);
    const a = await freshFloor(t);
    const b = await freshFloor(t);
    await t.mutation(api.walls.addStroke, {
      floorId: a,
      segments: [{ start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, color: "sand" }],
    });
    await t.mutation(api.walls.addStroke, {
      floorId: b,
      segments: [
        { start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, color: "concrete" },
      ],
    });
    const listA = await t.query(api.walls.listForFloor, { floorId: a });
    expect(listA).toHaveLength(1);
    expect(listA[0]?.color).toBe("sand");
  });

  it("eraseStroke removes only ids belonging to the given floor", async () => {
    const t = convexTest(schema, modules);
    const a = await freshFloor(t);
    const b = await freshFloor(t);
    const idsA = await t.mutation(api.walls.addStroke, {
      floorId: a,
      segments: [
        { start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, color: "sand" },
        { start: { x: 5, y: 0 }, end: { x: 10, y: 0 }, color: "sand" },
      ],
    });
    const idsB = await t.mutation(api.walls.addStroke, {
      floorId: b,
      segments: [
        { start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, color: "slate" },
      ],
    });

    const idA = idsA[0]; // guaranteed non-null by test setup
    const idB = idsB[0];
    await t.mutation(api.walls.eraseStroke, {
      floorId: a,
      removeIds: [idA, idB],
    });

    const remainingA = await t.query(api.walls.listForFloor, { floorId: a });
    const remainingB = await t.query(api.walls.listForFloor, { floorId: b });
    expect(remainingA).toHaveLength(1);
    expect(remainingB).toHaveLength(1);
  });

  it("removeAll clears the floor walls", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.walls.addStroke, {
      floorId,
      segments: [
        { start: { x: 0, y: 0 }, end: { x: 5, y: 0 }, color: "sand" },
        { start: { x: 5, y: 0 }, end: { x: 10, y: 0 }, color: "sand" },
        { start: { x: 10, y: 0 }, end: { x: 15, y: 0 }, color: "sand" },
      ],
    });
    await t.mutation(api.walls.removeAll, { floorId });
    const list = await t.query(api.walls.listForFloor, { floorId });
    expect(list).toHaveLength(0);
  });
});
