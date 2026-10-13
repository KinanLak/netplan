import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";

const SITE_ID = "site:arles";

const ensureSite = async (t: ReturnType<typeof convexTest>) =>
  await t.mutation(api.sites.ensureDefault, {});

describe("buildings", () => {
  it("list returns buildings sorted by order with application ids", async () => {
    const t = convexTest(schema, modules);
    await ensureSite(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("buildings", {
        objectId: "building:annexe",
        siteId: SITE_ID,
        name: "Annexe",
        order: 1,
      });
      await ctx.db.insert("buildings", {
        objectId: "building:principal",
        siteId: SITE_ID,
        name: "Principal",
        order: 0,
      });
    });
    const buildings = await t.query(api.buildings.list);
    expect(buildings).toEqual([
      {
        id: "building:principal",
        siteId: SITE_ID,
        name: "Principal",
        order: 0,
      },
      { id: "building:annexe", siteId: SITE_ID, name: "Annexe", order: 1 },
    ]);
  });

  it("create inserts a building by stable object id", async () => {
    const t = convexTest(schema, modules);
    await ensureSite(t);
    const id = await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:atelier",
      name: "Atelier",
    });
    const buildings = await t.query(api.buildings.list);
    expect(id).toBe("building:atelier");
    expect(buildings.map((b) => b.id)).toEqual(["building:atelier"]);
  });

  it("createDefaultMap idempotently creates the temporary dev map", async () => {
    const t = convexTest(schema, modules);
    await ensureSite(t);

    const first = await t.mutation(api.buildings.createDefaultMap, {
      siteId: SITE_ID,
    });
    const second = await t.mutation(api.buildings.createDefaultMap, {
      siteId: SITE_ID,
    });

    expect(second).toEqual(first);
    expect(first.buildingId).toBe("building:site:arles:default");
    expect(first.floorIds).toEqual([
      "floor:site:arles:default:rdc",
      "floor:site:arles:default:etage-1",
    ]);

    const buildings = await t.query(api.buildings.list);
    const floors = await t.query(api.floors.listForBuilding, {
      buildingId: first.buildingId,
    });
    expect(buildings).toEqual([
      {
        id: "building:site:arles:default",
        siteId: SITE_ID,
        name: "Bâtiment Principal",
        order: 0,
      },
    ]);
    expect(floors).toEqual([
      {
        id: "floor:site:arles:default:rdc",
        buildingId: "building:site:arles:default",
        name: "RDC",
        order: 0,
      },
      {
        id: "floor:site:arles:default:etage-1",
        buildingId: "building:site:arles:default",
        name: "Étage 1",
        order: 1,
      },
    ]);
  });

  it("clearMap removes all temporary map data", async () => {
    const t = convexTest(schema, modules);
    await ensureSite(t);
    const buildingId = await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:clear",
      name: "Clear",
    });
    const floorId = await t.mutation(api.floors.create, {
      objectId: "floor:clear",
      buildingId,
      name: "Floor",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:clear:a",
        floorId,
        type: "pc",
        name: "A",
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("devices", {
        objectId: "device:clear:b",
        floorId,
        type: "pc",
        name: "B",
        position: { x: 200, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("walls", {
        objectId: "wall:clear",
        floorId,
        start: { x: 0, y: 120 },
        end: { x: 20, y: 120 },
        color: "sand",
        geometryKey: `${floorId}:10:120`,
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("links", {
        objectId: "link:clear",
        floorId,
        fromDeviceId: "device:clear:a",
        toDeviceId: "device:clear:b",
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("presences", {
        sessionId: "session:clear",
        clientId: "client:clear",
        displayName: "Clear",
        colorHue: 120,
        floorId,
        updatedAt: 0,
      });
      await ctx.db.insert("clientOperations", {
        opId: "op:clear:0",
        clientId: "client:clear",
        clientSeq: 0,
        floorId,
        kind: "device.create",
        status: "applied",
        createdAt: 0,
        appliedAt: 0,
      });
    });

    await t.mutation(api.buildings.clearMap, { siteId: SITE_ID });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("buildings").collect()).toHaveLength(0);
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      expect(await ctx.db.query("devices").collect()).toHaveLength(0);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
      expect(await ctx.db.query("presences").collect()).toHaveLength(0);
      expect(await ctx.db.query("clientOperations").collect()).toHaveLength(0);
    });
  });

  it("rename updates the building name", async () => {
    const t = convexTest(schema, modules);
    await ensureSite(t);
    const id = await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:old",
      name: "Old",
    });
    await t.mutation(api.buildings.rename, { id, name: "New" });
    const buildings = await t.query(api.buildings.list);
    expect(buildings[0]?.name).toBe("New");
  });

  it("remove cascades floors, devices, walls, links", async () => {
    const t = convexTest(schema, modules);
    await ensureSite(t);
    const buildingId = await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:cascade",
      name: "Cascade",
    });
    const floorId = await t.mutation(api.floors.create, {
      objectId: "floor:cascade:1",
      buildingId,
      name: "Floor",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:a",
        floorId,
        type: "pc",
        name: "A",
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("devices", {
        objectId: "device:b",
        floorId,
        type: "pc",
        name: "B",
        position: { x: 100, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("walls", {
        objectId: "wall:a",
        floorId,
        start: { x: 0, y: 0 },
        end: { x: 50, y: 0 },
        color: "sand",
        geometryKey: "0:0:50:0",
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("links", {
        objectId: "link:a",
        floorId,
        fromDeviceId: "device:a",
        toDeviceId: "device:b",
        updatedAt: 0,
        updatedBy: "test",
      });
    });

    await t.mutation(internal.buildings.remove, { id: buildingId });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("buildings").collect()).toHaveLength(0);
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      expect(await ctx.db.query("devices").collect()).toHaveLength(0);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
    });
  });
});
