import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

describe("buildings", () => {
  it("list returns buildings sorted by order", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("buildings", { name: "Annexe", order: 1 });
      await ctx.db.insert("buildings", { name: "Principal", order: 0 });
    });
    const buildings = await t.query(api.buildings.list);
    expect(buildings.map((b) => b.name)).toEqual(["Principal", "Annexe"]);
  });

  it("create inserts a building and a default floor", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.buildings.create, { name: "Atelier" });
    const buildings = await t.query(api.buildings.list);
    expect(buildings.map((b) => b.name)).toEqual(["Atelier"]);
    const floors = await t.query(api.floors.listForBuilding, {
      buildingId: id,
    });
    expect(floors.map((f) => f.name)).toEqual(["Étage 1"]);
  });

  it("rename updates the building name", async () => {
    const t = convexTest(schema, modules);
    const id = await t.mutation(api.buildings.create, { name: "Old" });
    await t.mutation(api.buildings.rename, { id, name: "New" });
    const buildings = await t.query(api.buildings.list);
    expect(buildings[0]?.name).toBe("New");
  });

  it("remove cascades floors, devices, walls, links", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, {
      name: "Cascade",
    });
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
        type: "pc",
        name: "B",
        position: { x: 100, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
      });
      await ctx.db.insert("walls", {
        floorId,
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        color: "sand",
      });
      await ctx.db.insert("links", {
        floorId,
        fromDeviceId: a,
        toDeviceId: b,
      });
    });

    await t.mutation(api.buildings.remove, { id: buildingId });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("buildings").collect()).toHaveLength(0);
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      expect(await ctx.db.query("devices").collect()).toHaveLength(0);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
    });
  });
});
