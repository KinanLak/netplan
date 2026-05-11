import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

describe("presences", () => {
  it("upserts a presence row keyed by sessionId", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, { name: "B" });
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    const floorId = floors[0]._id;

    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
      cursor: { x: 10, y: 10 },
    });
    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
      cursor: { x: 20, y: 30 },
    });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences).toHaveLength(1);
    expect(presences[0]?.cursor).toEqual({ x: 20, y: 30 });
  });

  it("only returns presences from the requested floor and within TTL", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, { name: "B" });
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    const floorA = floors[0]._id;

    const otherBuilding = await t.mutation(api.buildings.create, {
      name: "Other",
    });
    const otherFloors = await t.query(api.floors.listForBuilding, {
      buildingId: otherBuilding,
    });
    const floorB = otherFloors[0]._id;

    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      displayName: "A",
      colorHue: 100,
      floorId: floorA,
      cursor: { x: 0, y: 0 },
    });
    await t.mutation(api.presences.updateCursor, {
      sessionId: "bob",
      displayName: "B",
      colorHue: 200,
      floorId: floorB,
      cursor: { x: 0, y: 0 },
    });

    await t.run(async (ctx) => {
      const stale = await ctx.db
        .query("presences")
        .withIndex("by_session", (q) => q.eq("sessionId", "alice"))
        .unique();
      if (stale) await ctx.db.patch(stale._id, { updatedAt: 0 });
    });

    const onA = await t.query(api.presences.listForFloor, { floorId: floorA });
    const onB = await t.query(api.presences.listForFloor, { floorId: floorB });
    expect(onA).toHaveLength(0);
    expect(onB.map((p) => p.sessionId)).toEqual(["bob"]);
  });

  it("remove deletes the presence row", async () => {
    const t = convexTest(schema, modules);
    const buildingId = await t.mutation(api.buildings.create, { name: "B" });
    const floors = await t.query(api.floors.listForBuilding, { buildingId });
    const floorId = floors[0]._id;

    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      displayName: "A",
      colorHue: 0,
      floorId,
      cursor: { x: 0, y: 0 },
    });
    await t.mutation(api.presences.remove, { sessionId: "alice" });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences).toHaveLength(0);
  });

  it("rejects selections outside the presence floor", async () => {
    const t = convexTest(schema, modules);
    const buildingA = await t.mutation(api.buildings.create, { name: "A" });
    const floorsA = await t.query(api.floors.listForBuilding, {
      buildingId: buildingA,
    });
    const floorA = floorsA[0]._id;
    const buildingB = await t.mutation(api.buildings.create, { name: "B" });
    const floorsB = await t.query(api.floors.listForBuilding, {
      buildingId: buildingB,
    });
    const floorB = floorsB[0]._id;
    const deviceId = await t.mutation(api.devices.create, {
      floorId: floorB,
      type: "pc",
      name: "PC",
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
      metadata: {},
    });

    let message = "";
    try {
      await t.mutation(api.presences.updateCursor, {
        sessionId: "alice",
        displayName: "A",
        colorHue: 100,
        floorId: floorA,
        cursor: { x: 0, y: 0 },
        selectedDeviceId: deviceId,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("presence floor");
  });
});
