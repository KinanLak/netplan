import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

describe("floors", () => {
  it("listForBuilding returns floors of the given building only", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(api.buildings.create, { name: "A" });
    const b = await t.mutation(api.buildings.create, { name: "B" });
    await t.mutation(api.floors.create, { buildingId: a, name: "RDC" });
    await t.mutation(api.floors.create, { buildingId: b, name: "Sous-sol" });

    const floorsA = await t.query(api.floors.listForBuilding, {
      buildingId: a,
    });
    expect(floorsA.map((f) => f.name)).toEqual(["Étage 1", "RDC"]);
  });

  it("create assigns sequential order", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, { name: "X" });
    await t.mutation(api.floors.create, { buildingId, name: "Étage 2" });
    await t.mutation(api.floors.create, { buildingId, name: "Étage 3" });

    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    expect(floors.map((f) => f.order)).toEqual([0, 1, 2]);
    expect(floors.map((f) => f.name)).toEqual([
      "Étage 1",
      "Étage 2",
      "Étage 3",
    ]);
  });

  it("rename updates a floor name", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, { name: "X" });
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    const id = floors[0]._id;
    await t.mutation(api.floors.rename, { id, name: "Renamed" });
    const after = await t.query(api.floors.listForBuilding, { buildingId });
    expect(after[0]?.name).toBe("Renamed");
  });

  it("remove cascades devices, walls, and links of the floor", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, { name: "X" });
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    const floorId = floors[0]._id;

    await t.run(async (ctx) => {
      const a = await ctx.db.insert("devices", {
        floorId,
        type: "pc",
        name: "A",
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
      });
      const b = await ctx.db.insert("devices", {
        floorId,
        type: "switch",
        name: "B",
        position: { x: 200, y: 0 },
        size: { width: 200, height: 60 },
        metadata: {},
      });
      await ctx.db.insert("walls", {
        floorId,
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        color: "concrete",
      });
      await ctx.db.insert("links", {
        floorId,
        fromDeviceId: a,
        toDeviceId: b,
      });
    });

    await t.mutation(api.floors.remove, { id: floorId });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      expect(await ctx.db.query("devices").collect()).toHaveLength(0);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
      expect(await ctx.db.query("buildings").collect()).toHaveLength(1);
    });
  });
});
