import { describe, expect, it } from "bun:test";
import { api, internal } from "./_generated/api";
import { signedInTest, createTestSite } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";
import { insertCabledPcs } from "./_test/cabling";

let counter = 0;

async function freshBuilding(t: TestClient) {
  counter += 1;
  const siteId = await createTestSite(t);
  return await t.mutation(api.buildings.create, {
    siteId,
    objectId: `building:${counter}`,
    name: `Building ${counter}`,
  });
}

describe("floors", () => {
  it("listForBuilding returns floors of the given building only", async () => {
    const t = await signedInTest();
    const a = await freshBuilding(t);
    const b = await freshBuilding(t);
    await t.mutation(api.floors.create, {
      objectId: "floor:a:rdc",
      buildingId: a,
      name: "RDC",
    });
    await t.mutation(api.floors.create, {
      objectId: "floor:b:ss",
      buildingId: b,
      name: "Sous-sol",
    });

    const floorsA = await t.query(api.floors.listForBuilding, {
      buildingId: a,
    });
    expect(floorsA.map((f) => f.name)).toEqual(["RDC"]);
  });

  it("listAll returns floors across every building", async () => {
    const t = await signedInTest();
    const a = await freshBuilding(t);
    const b = await freshBuilding(t);
    await t.mutation(api.floors.create, {
      objectId: "floor:all:a",
      buildingId: a,
      name: "RDC",
    });
    await t.mutation(api.floors.create, {
      objectId: "floor:all:b",
      buildingId: b,
      name: "Sous-sol",
    });

    const all = await t.query(api.floors.listAll, {});
    const byFloor = new Map(all.map((f) => [f.id, f.buildingId]));
    expect(byFloor.get("floor:all:a")).toBe(a);
    expect(byFloor.get("floor:all:b")).toBe(b);
  });

  it("create assigns sequential order", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    await t.mutation(api.floors.create, {
      objectId: "floor:x:2",
      buildingId,
      name: "Étage 2",
    });
    await t.mutation(api.floors.create, {
      objectId: "floor:x:3",
      buildingId,
      name: "Étage 3",
    });

    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    expect(floors.map((f) => f.order)).toEqual([0, 1]);
    expect(floors.map((f) => f.name)).toEqual(["Étage 2", "Étage 3"]);
  });

  it("rename updates a floor name", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    const id = await t.mutation(api.floors.create, {
      objectId: "floor:rename",
      buildingId,
      name: "Old",
    });
    await t.mutation(api.floors.rename, { id, name: "Renamed" });
    const after = await t.query(api.floors.listForBuilding, { buildingId });
    expect(after[0]?.name).toBe("Renamed");
  });

  it("remove unplaces the devices of the floor, cables kept, and cascades its walls and presences", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    const floorId = await t.mutation(api.floors.create, {
      objectId: "floor:cascade",
      buildingId,
      name: "Floor",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:a",
        siteId: "site:test",
        type: "pc",
        name: "A",
        macs: [],
        placement: {
          floorId,
          position: { x: 0, y: 0 },
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
        color: "concrete",
        geometryKey: "0:0:50:0",
        updatedAt: 0,
        updatedBy: "test",
      });
      // Its far end is on another floor.
      await insertCabledPcs(ctx, "site:test", "device:a", "device:far");
      await ctx.db.insert("presences", {
        clientId: "client:alice",
        userId: "user:a",
        displayName: "A",
        floorId,
        activeAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.floors.remove, { id: floorId });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      // Devices stay in the site's inventory, off the map.
      const devices = await ctx.db.query("devices").collect();
      expect(devices.map((device) => device.objectId)).toEqual(["device:a"]);
      expect(devices.every((device) => !device.placement)).toBe(true);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("cables").collect()).toHaveLength(1);
      expect(await ctx.db.query("presences").collect()).toHaveLength(0);
      expect(await ctx.db.query("buildings").collect()).toHaveLength(1);
    });
  });

  it("rejects creates for deleted buildings", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    await t.mutation(internal.buildings.remove, { id: buildingId });

    let message = "";
    try {
      await t.mutation(api.floors.create, {
        objectId: "floor:ghost",
        buildingId,
        name: "Ghost",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("Building not found");
  });
});
