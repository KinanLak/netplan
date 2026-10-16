import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { signedInTest, createTestSite } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

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

  it("refuses a floor named like another of its building", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    const other = await freshBuilding(t);
    const create = (objectId: string, name: string, building = buildingId) =>
      t.mutation(api.floors.create, { objectId, buildingId: building, name });
    await create("floor:dup:1", "Étage 1");

    await expect(create("floor:dup:2", "étage 1")).rejects.toThrow(
      "Ce bâtiment a déjà un étage « étage 1 ».",
    );
    await expect(create("floor:dup:3", " ")).rejects.toThrow(
      "Le nom de l'étage est obligatoire.",
    );
    await create("floor:dup:4", "Étage 1", other);
    await expect(create("floor:dup:1", "Étage 9", other)).rejects.toThrow(
      "Cet identifiant d'étage est déjà pris.",
    );

    await create("floor:dup:5", "Étage 2");
    await expect(
      t.mutation(api.floors.rename, { id: "floor:dup:5", name: "ÉTAGE 1" }),
    ).rejects.toThrow("Ce bâtiment a déjà un étage « ÉTAGE 1 ».");
  });

  it("removes an empty floor, and refuses one that still holds a drawing", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    const floorId = await t.mutation(api.floors.create, {
      objectId: "floor:held",
      buildingId,
      name: "Floor",
    });
    const emptyId = await t.mutation(api.floors.create, {
      objectId: "floor:empty",
      buildingId,
      name: "Empty",
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
      await ctx.db.insert("presences", {
        clientId: "client:alice",
        userId: "user:a",
        displayName: "A",
        floorId: emptyId,
        activeAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(api.floors.remove, { id: floorId }),
    ).rejects.toThrow(
      "L'étage « Floor » porte encore des équipements : videz-le avant de le supprimer.",
    );
    await t.mutation(api.floors.remove, { id: emptyId });

    const left = await t.query(api.floors.listForBuilding, { buildingId });
    expect(left.map((floor) => floor.id)).toEqual([floorId]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("presences").collect()).toHaveLength(0);
    });
  });

  it("rejects creates for deleted buildings", async () => {
    const t = await signedInTest();
    const buildingId = await freshBuilding(t);
    await t.mutation(api.buildings.remove, { id: buildingId });

    await expect(
      t.mutation(api.floors.create, {
        objectId: "floor:ghost",
        buildingId,
        name: "Ghost",
      }),
    ).rejects.toThrow("Ce bâtiment n'existe plus.");
  });
});
