import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

async function freshBuilding(t: ReturnType<typeof convexTest>) {
  counter += 1;
  return await t.mutation(api.buildings.create, {
    objectId: `building:${counter}`,
    name: `Building ${counter}`,
  });
}

describe("floors", () => {
  it("listForBuilding returns floors of the given building only", async () => {
    const t = convexTest(schema, modules);
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

  it("create assigns sequential order", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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

  it("remove cascades devices, walls, links, and presences of the floor", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await freshBuilding(t);
    const floorId = await t.mutation(api.floors.create, {
      objectId: "floor:cascade",
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
      await ctx.db.insert("links", {
        objectId: "link:a",
        floorId,
        fromDeviceId: "device:a",
        toDeviceId: "device:a",
        updatedAt: 0,
        updatedBy: "test",
      });
      await ctx.db.insert("presences", {
        sessionId: "alice",
        clientId: "client:alice",
        displayName: "A",
        colorHue: 100,
        floorId,
        cursor: { x: 0, y: 0 },
        selectedDeviceId: "device:a",
        updatedAt: Date.now(),
      });
    });

    await t.mutation(internal.floors.remove, { id: floorId });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      expect(await ctx.db.query("devices").collect()).toHaveLength(0);
      expect(await ctx.db.query("walls").collect()).toHaveLength(0);
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
      expect(await ctx.db.query("presences").collect()).toHaveLength(0);
      expect(await ctx.db.query("buildings").collect()).toHaveLength(1);
    });
  });

  it("rejects creates for deleted buildings", async () => {
    const t = convexTest(schema, modules);
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
