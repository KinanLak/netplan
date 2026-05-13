import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

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
  it("upserts an online user row keyed by clientId", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
    });
    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "Renard Rapide",
      colorHue: 210,
      floorId,
    });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences).toHaveLength(1);
    expect(presences[0]?.clientId).toBe("client:alice");
    expect(presences[0]?.colorHue).toBe(210);
  });

  it("replaces an older session for the same client", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "alice:old",
      clientId: "client:alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
    });
    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "alice:new",
      clientId: "client:alice",
      displayName: "Renard Rapide",
      colorHue: 200,
      floorId,
    });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences).toHaveLength(1);
    expect(presences[0]?.sessionId).toBe("alice:new");

    const rows = await t.run((ctx) => ctx.db.query("presences").collect());
    expect(rows).toHaveLength(1);
  });

  it("returns online users from the requested floor", async () => {
    const t = convexTest(schema, modules);
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);

    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "A",
      colorHue: 100,
      floorId: floorA,
    });
    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "bob",
      clientId: "client:bob",
      displayName: "B",
      colorHue: 200,
      floorId: floorB,
    });

    const onA = await t.query(api.presences.listForFloor, { floorId: floorA });
    const onB = await t.query(api.presences.listForFloor, { floorId: floorB });
    expect(onA.map((p) => p.sessionId)).toEqual(["alice"]);
    expect(onB.map((p) => p.sessionId)).toEqual(["bob"]);
  });

  it("remove deletes online user rows for the session", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);

    await t.mutation(api.presences.updateOnlineUser, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "A",
      colorHue: 0,
      floorId,
    });
    await t.mutation(api.presences.remove, { sessionId: "alice" });

    const presences = await t.query(api.presences.listForFloor, { floorId });
    expect(presences).toHaveLength(0);
  });

  it("rejects unknown floors", async () => {
    const t = convexTest(schema, modules);

    let message = "";
    try {
      await t.mutation(api.presences.updateOnlineUser, {
        sessionId: "alice",
        clientId: "client:alice",
        displayName: "A",
        colorHue: 100,
        floorId: "floor:missing",
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("Floor not found");
  });
});
