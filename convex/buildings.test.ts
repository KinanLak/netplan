import { describe, expect, it } from "bun:test";
import { api, internal } from "./_generated/api";
import { signedInTest, createTestSite } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

const SITE_ID = "site:main";

const ensureSite = async (t: TestClient) =>
  await createTestSite(t, { objectId: SITE_ID });

describe("buildings", () => {
  it("list returns buildings sorted by order with application ids", async () => {
    const t = await signedInTest();
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
    const t = await signedInTest();
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
    const t = await signedInTest();
    await ensureSite(t);

    const first = await t.mutation(api.buildings.createDefaultMap, {
      siteId: SITE_ID,
    });
    const second = await t.mutation(api.buildings.createDefaultMap, {
      siteId: SITE_ID,
    });

    expect(second).toEqual(first);
    expect(first.buildingId).toBe("building:site:main:default");
    expect(first.floorIds).toEqual([
      "floor:site:main:default:rdc",
      "floor:site:main:default:etage-1",
    ]);

    const buildings = await t.query(api.buildings.list);
    const floors = await t.query(api.floors.listForBuilding, {
      buildingId: first.buildingId,
    });
    expect(buildings).toEqual([
      {
        id: "building:site:main:default",
        siteId: SITE_ID,
        name: "Bâtiment Principal",
        order: 0,
      },
    ]);
    expect(floors).toEqual([
      {
        id: "floor:site:main:default:rdc",
        buildingId: "building:site:main:default",
        name: "RDC",
        order: 0,
      },
      {
        id: "floor:site:main:default:etage-1",
        buildingId: "building:site:main:default",
        name: "Étage 1",
        order: 1,
      },
    ]);
  });

  it("clearMap removes the map and its drawn devices, leaving sourced ones unplaced", async () => {
    const t = await signedInTest();
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
        siteId: SITE_ID,
        type: "pc",
        name: "A",
        macs: ["02:00:00:00:00:0a"],
        placement: {
          floorId,
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
        },
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("deviceMacs", {
        siteId: SITE_ID,
        mac: "02:00:00:00:00:0a",
        deviceId: "device:clear:a",
      });
      await ctx.db.insert("devices", {
        objectId: "device:clear:b",
        siteId: SITE_ID,
        type: "pc",
        name: "B",
        macs: [],
        source: { integration: "netbox", externalId: "7", syncedAt: 0 },
        placement: {
          floorId,
          position: { x: 200, y: 0 },
          size: { width: 80, height: 80 },
        },
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
        clientId: "client:clear",
        userId: "user:a",
        displayName: "A",
        floorId,
        activeAt: 0,
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
      const devices = await ctx.db.query("devices").collect();
      expect(devices.map((device) => device.objectId)).toEqual([
        "device:clear:b",
      ]);
      expect(devices[0]?.placement).toBeUndefined();
      expect(await ctx.db.query("deviceMacs").collect()).toHaveLength(0);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
      expect(await ctx.db.query("presences").collect()).toHaveLength(0);
      expect(await ctx.db.query("clientOperations").collect()).toHaveLength(0);
    });
  });

  it("rename updates the building name", async () => {
    const t = await signedInTest();
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

  it("remove cascades floors, walls and links and unplaces devices", async () => {
    const t = await signedInTest();
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
        siteId: SITE_ID,
        type: "pc",
        name: "A",
        macs: ["02:00:00:00:00:0a"],
        placement: {
          floorId,
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
        },
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("devices", {
        objectId: "device:b",
        siteId: SITE_ID,
        type: "pc",
        name: "B",
        macs: [],
        placement: {
          floorId,
          position: { x: 100, y: 0 },
          size: { width: 80, height: 80 },
        },
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
      // Devices stay in the site's inventory, off the map.
      const devices = await ctx.db.query("devices").collect();
      expect(devices.map((device) => device.objectId)).toEqual([
        "device:a",
        "device:b",
      ]);
      expect(devices.every((device) => !device.placement)).toBe(true);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
    });
  });
});
