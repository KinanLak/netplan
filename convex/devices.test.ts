import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { modules } from "./_test/modules";

let counter = 0;

const meta = () => ({
  opId: `op:devices:${counter}`,
  clientId: "client:devices",
  clientSeq: counter,
  createdAt: counter,
});

async function freshFloor(t: ReturnType<typeof convexTest>) {
  counter += 1;
  const buildingId = await t.mutation(api.buildings.create, {
    objectId: `building:devices:${counter}`,
    name: "Test",
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:devices:${counter}`,
    buildingId,
    name: "Floor",
  });
}

const createDevice = async (
  t: ReturnType<typeof convexTest>,
  floorId: string,
  objectId: string,
  name: string,
  x: number,
) => {
  counter += 1;
  await t.mutation(api.mapOperations.apply, {
    operation: {
      kind: "device.create",
      meta: meta(),
      device: {
        id: objectId,
        floorId,
        type: "pc",
        name,
        position: { x, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
      },
    },
  });
  return objectId;
};

describe("devices", () => {
  it("listForFloor returns only devices on that floor", async () => {
    const t = convexTest(schema, modules);
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);

    await createDevice(t, floorA, "device:a", "PC-A", 0);
    await createDevice(t, floorB, "device:b", "PC-B", 0);

    const list = await t.query(api.devices.listForFloor, { floorId: floorA });
    expect(list.map((d) => d.name)).toEqual(["PC-A"]);
    expect(list[0]?.id).toBe("device:a");
  });

  it("reflects device patches applied through mapOperations", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:patch", "Old", 0);
    counter += 1;

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(),
        deviceId: id,
        patch: {
          name: "New",
          hostname: "host-new",
          position: { x: 200, y: 300 },
        },
      },
    });

    const list = await t.query(api.devices.listForFloor, { floorId });
    expect(list[0]).toMatchObject({
      name: "New",
      hostname: "host-new",
      position: { x: 200, y: 300 },
    });
  });

  it("device deletion through mapOperations clears presence selections", async () => {
    const t = convexTest(schema, modules);
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:presence", "PC", 0);
    await t.mutation(api.presences.updateCursor, {
      sessionId: "alice",
      clientId: "client:alice",
      displayName: "A",
      colorHue: 100,
      floorId,
      cursor: { x: 0, y: 0 },
      selectedDeviceId: id,
      selectedObjectIds: [id],
    });
    counter += 1;

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.delete",
        meta: meta(),
        deviceId: id,
      },
    });

    await t.run(async (ctx) => {
      const presence = await ctx.db
        .query("presences")
        .withIndex("by_session", (q) => q.eq("sessionId", "alice"))
        .unique();
      expect(presence?.selectedDeviceId).toBe(undefined);
      expect(presence?.selectedObjectIds).toEqual([]);
    });
  });
});
