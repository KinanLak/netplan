import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

async function freshFloor(t: ReturnType<typeof convexTest>) {
  const buildingId = await t.mutation(api.buildings.create, { name: "Test" });
  const floors = await t.query(api.floors.listForBuilding, { buildingId });
  return floors[0]._id;
}

describe("devices", () => {
  it("listForFloor returns only devices on that floor", async () => {
    const t = convexTest(schema, modules);
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);

    await t.mutation(api.devices.create, {
      floorId: floorA,
      type: "pc",
      name: "PC-A",
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
      metadata: {},
    });
    await t.mutation(api.devices.create, {
      floorId: floorB,
      type: "pc",
      name: "PC-B",
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
      metadata: {},
    });

    const list = await t.query(api.devices.listForFloor, { floorId: floorA });
    expect(list.map((d) => d.name)).toEqual(["PC-A"]);
  });

  it("updatePosition patches only the position field", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const id = await t.mutation(api.devices.create, {
      floorId,
      type: "rack",
      name: "Rack",
      hostname: "rack-01",
      position: { x: 10, y: 20 },
      size: { width: 80, height: 160 },
      metadata: { ip: "10.0.0.1" },
    });

    await t.mutation(api.devices.updatePosition, {
      id,
      position: { x: 200, y: 300 },
    });

    const list = await t.query(api.devices.listForFloor, { floorId });
    expect(list[0]).toMatchObject({
      position: { x: 200, y: 300 },
      hostname: "rack-01",
      metadata: { ip: "10.0.0.1" },
    });
  });

  it("rename updates name and hostname", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const id = await t.mutation(api.devices.create, {
      floorId,
      type: "pc",
      name: "Old",
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
      metadata: {},
    });
    await t.mutation(api.devices.rename, {
      id,
      name: "New",
      hostname: "host-new",
    });
    const list = await t.query(api.devices.listForFloor, { floorId });
    expect(list[0]?.name).toBe("New");
    expect(list[0]?.hostname).toBe("host-new");
  });

  it("updateMetadata replaces the metadata blob", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const id = await t.mutation(api.devices.create, {
      floorId,
      type: "switch",
      name: "Sw",
      position: { x: 0, y: 0 },
      size: { width: 200, height: 60 },
      metadata: { ip: "1.1.1.1" },
    });
    await t.mutation(api.devices.updateMetadata, {
      id,
      metadata: { ip: "2.2.2.2", status: "up" },
    });
    const list = await t.query(api.devices.listForFloor, { floorId });
    expect(list[0]?.metadata).toEqual({ ip: "2.2.2.2", status: "up" });
  });

  it("remove cascades incoming and outgoing links", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const a = await t.mutation(api.devices.create, {
      floorId,
      type: "pc",
      name: "A",
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
      metadata: {},
    });
    const b = await t.mutation(api.devices.create, {
      floorId,
      type: "switch",
      name: "B",
      position: { x: 200, y: 0 },
      size: { width: 200, height: 60 },
      metadata: {},
    });
    const c = await t.mutation(api.devices.create, {
      floorId,
      type: "pc",
      name: "C",
      position: { x: 0, y: 200 },
      size: { width: 80, height: 80 },
      metadata: {},
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("links", { floorId, fromDeviceId: a, toDeviceId: b });
      await ctx.db.insert("links", { floorId, fromDeviceId: b, toDeviceId: c });
    });

    const removed = await t.mutation(api.devices.remove, { id: b });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("links").collect()).toHaveLength(0);
    });
    expect(removed.deviceId).toBe(b);
    expect(removed.links).toHaveLength(2);
    const remaining = await t.query(api.devices.listForFloor, { floorId });
    expect(remaining.map((d) => d.name).sort()).toEqual(["A", "C"]);
  });

  it("rejects creates for deleted floors", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.floors.remove, { id: floorId });

    let message = "";
    try {
      await t.mutation(api.devices.create, {
        floorId,
        type: "pc",
        name: "Orphan",
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("Floor not found");
  });

  it("clears presence selections when removing a device", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const id = await t.mutation(api.devices.create, {
      floorId,
      type: "pc",
      name: "PC",
      position: { x: 0, y: 0 },
      size: { width: 80, height: 80 },
      metadata: {},
    });
    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      displayName: "A",
      colorHue: 100,
      floorId,
      cursor: { x: 0, y: 0 },
      selectedDeviceId: id,
    });

    await t.mutation(api.devices.remove, { id });

    await t.run(async (ctx) => {
      const presence = await ctx.db
        .query("presences")
        .withIndex("by_session", (q) => q.eq("sessionId", "alice"))
        .unique();
      expect(presence?.selectedDeviceId).toBe(undefined);
    });
  });
});
