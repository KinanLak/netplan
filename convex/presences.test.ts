import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

const meta = () => ({
  opId: `op:presence:${counter}`,
  clientId: "client:presence",
  clientSeq: counter,
  createdAt: counter,
});

async function freshFloor(t: ReturnType<typeof convexTest>) {
  counter += 1;
  const buildingId = await t.mutation(api.buildings.create, {
    objectId: `building:presence:${counter}`,
    name: "B",
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:presence:${counter}`,
    buildingId,
    name: "Floor",
  });
}

describe("presences", () => {
  it("upserts a presence row keyed by sessionId", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
      cursor: { x: 10, y: 10 },
    });
    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
      cursor: { x: 20, y: 30 },
    });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences).toHaveLength(1);
    expect(presences[0]?.cursor).toEqual({ x: 20, y: 30 });
    expect(presences[0]?.clientId).toBe("client:alice");
  });

  it("only returns presences from the requested floor and within TTL", async () => {
    const t = convexTest(schema, modules);
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);

    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "A",
      colorHue: 100,
      floorId: floorA,
      cursor: { x: 0, y: 0 },
    });
    await t.mutation(api.presences.updateCursor, {
      sessionId: "bob",
      clientId: "client:bob",
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
    const floorId = await freshFloor(t);

    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      clientId: "client:alice",
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
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);
    const deviceId = "device:presence:foreign";
    counter += 1;
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: meta(),
        device: {
          id: deviceId,
          floorId: floorB,
          type: "pc",
          name: "PC",
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
          metadata: {},
        },
      },
    });

    let message = "";
    try {
      await t.mutation(api.presences.updateCursor, {
        sessionId: "alice",
        clientId: "client:alice",
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

  it("stores drag preview leases separately from durable document state", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "A",
      colorHue: 100,
      floorId,
      editing: {
        kind: "device.drag",
        deviceId: "device:a",
        previewPosition: { x: 40, y: 60 },
        expiresAt: Date.now() + 1000,
      },
    });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences[0]?.editing).toMatchObject({
      kind: "device.drag",
      deviceId: "device:a",
    });
  });
});
