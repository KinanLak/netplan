import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

const meta = () => ({
  opId: `op:walls:${counter}`,
  clientId: "client:walls",
  clientSeq: counter,
  createdAt: counter,
});

async function freshFloor(t: ReturnType<typeof convexTest>) {
  counter += 1;
  const buildingId = await t.mutation(api.buildings.create, {
    objectId: `building:walls:${counter}`,
    name: "Test",
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:walls:${counter}`,
    buildingId,
    name: "Floor",
  });
}

const addWall = async (
  t: ReturnType<typeof convexTest>,
  floorId: string,
  id: string,
  color: "sand" | "concrete" | "slate",
) => {
  counter += 1;
  await t.mutation(api.mapOperations.apply, {
    operation: {
      kind: "walls.add",
      meta: meta(),
      walls: [
        {
          id,
          floorId,
          start: { x: 0, y: 0 },
          end: { x: 20, y: 0 },
          color,
          geometryKey: "client-provided-key",
        },
      ],
    },
  });
};

describe("walls", () => {
  it("listForFloor isolates walls by floor", async () => {
    const t = convexTest(schema, modules);
    const a = await freshFloor(t);
    const b = await freshFloor(t);
    await addWall(t, a, "wall:a", "sand");
    await addWall(t, b, "wall:b", "concrete");

    const listA = await t.query(api.walls.listForFloor, { floorId: a });
    expect(listA).toHaveLength(1);
    expect(listA[0]?.id).toBe("wall:a");
    expect(listA[0]?.color).toBe("sand");
  });

  it("reflects wall deletion applied through mapOperations", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await addWall(t, floorId, "wall:delete", "slate");
    counter += 1;

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "walls.delete",
        meta: meta(),
        wallIds: ["wall:delete"],
      },
    });

    const list = await t.query(api.walls.listForFloor, { floorId });
    expect(list).toHaveLength(0);
  });
});
