import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
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

  it("creates a building with its first floor, names trimmed", async () => {
    const t = await signedInTest();
    await ensureSite(t);
    await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:first",
      name: "  Bâtiment   Nord ",
      firstFloor: { objectId: "floor:first:rdc", name: " RDC " },
    });

    expect((await t.query(api.buildings.list)).map((b) => b.name)).toEqual([
      "Bâtiment Nord",
    ]);
    const floors = await t.query(api.floors.listForBuilding, {
      buildingId: "building:first",
    });
    expect(floors).toEqual([
      {
        id: "floor:first:rdc",
        buildingId: "building:first",
        name: "RDC",
        order: 0,
      },
    ]);
  });

  it("refuses a building without a name, or named like another of the site", async () => {
    const t = await signedInTest();
    await ensureSite(t);
    const other = await createTestSite(t);
    await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:nord",
      name: "Nord",
    });
    const create = (objectId: string, name: string, siteId = SITE_ID) =>
      t.mutation(api.buildings.create, { siteId, objectId, name });

    await expect(create("building:blank", "   ")).rejects.toThrow(
      "Le nom du bâtiment est obligatoire.",
    );
    await expect(create("building:twin", "nord")).rejects.toThrow(
      "Ce site a déjà un bâtiment « nord ».",
    );
    await expect(create("building:long", "x".repeat(61))).rejects.toThrow(
      "dépasse 60 caractères",
    );
    // Another site may have its own "Nord".
    await create("building:elsewhere", "Nord", other);
    await expect(create("building:nord", "Nord", other)).rejects.toThrow(
      "Cet identifiant de bâtiment est déjà pris.",
    );
    // A retry of the same creation finds it.
    expect(await create("building:nord", "Nord")).toBe("building:nord");
  });

  it("refuses to rename a building like another of the site", async () => {
    const t = await signedInTest();
    await ensureSite(t);
    for (const [objectId, name] of [
      ["building:a", "A"],
      ["building:b", "B"],
    ]) {
      await t.mutation(api.buildings.create, {
        siteId: SITE_ID,
        objectId,
        name,
      });
    }

    await expect(
      t.mutation(api.buildings.rename, { id: "building:b", name: "a" }),
    ).rejects.toThrow("Ce site a déjà un bâtiment « a ».");
    // Its own name, in another case, is fine.
    await t.mutation(api.buildings.rename, { id: "building:b", name: "b" });
    await expect(
      t.mutation(api.buildings.rename, { id: "building:gone", name: "C" }),
    ).rejects.toThrow("Ce bâtiment n'existe plus.");
  });

  it("removes an empty building with its empty floors", async () => {
    const t = await signedInTest();
    await ensureSite(t);
    await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:empty",
      name: "Vide",
      firstFloor: { objectId: "floor:empty:rdc", name: "RDC" },
    });
    await t.mutation(api.floors.create, {
      objectId: "floor:empty:1",
      buildingId: "building:empty",
      name: "Étage 1",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("presences", {
        clientId: "client:alice",
        userId: "user:a",
        displayName: "A",
        floorId: "floor:empty:1",
        activeAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await t.mutation(api.buildings.remove, { id: "building:empty" });
    // Removing it again changes nothing.
    await t.mutation(api.buildings.remove, { id: "building:empty" });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("buildings").collect()).toHaveLength(0);
      expect(await ctx.db.query("floors").collect()).toHaveLength(0);
      expect(await ctx.db.query("presences").collect()).toHaveLength(0);
    });
  });

  it("refuses to remove a building while a floor still holds a drawing", async () => {
    const t = await signedInTest();
    await ensureSite(t);
    const buildingId = await t.mutation(api.buildings.create, {
      siteId: SITE_ID,
      objectId: "building:full",
      name: "Plein",
      firstFloor: { objectId: "floor:full:rdc", name: "RDC" },
    });
    const floorId = "floor:full:rdc";
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:a",
        siteId: SITE_ID,
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
        color: "sand",
        geometryKey: "0:0:50:0",
        updatedAt: 0,
        updatedBy: "test",
      });
    });

    await expect(
      t.mutation(api.buildings.remove, { id: buildingId }),
    ).rejects.toThrow(
      "L'étage « RDC » porte encore 1 équipement et 1 bloc de mur.",
    );
    await t.run(async (ctx) => {
      expect(await ctx.db.query("buildings").collect()).toHaveLength(1);
      expect(await ctx.db.query("floors").collect()).toHaveLength(1);
    });
  });
});
