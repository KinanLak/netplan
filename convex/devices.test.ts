import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { signedInTest, createTestSite } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

let counter = 0;

const meta = () => ({
  opId: `op:devices:${counter}`,
  clientId: "client:devices",
  clientSeq: counter,
  createdAt: counter,
});

async function freshFloor(t: TestClient) {
  counter += 1;
  const siteId = await createTestSite(t);
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
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
  t: TestClient,
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
        macs: [],
        metadata: {},
      },
    },
  });
  return objectId;
};

describe("devices", () => {
  it("listForFloor returns only devices on that floor", async () => {
    const t = await signedInTest();
    const floorA = await freshFloor(t);
    const floorB = await freshFloor(t);

    await createDevice(t, floorA, "device:a", "PC-A", 0);
    await createDevice(t, floorB, "device:b", "PC-B", 0);

    const list = await t.query(api.devices.listForFloor, { floorId: floorA });
    expect(list.map((d) => d.name)).toEqual(["PC-A"]);
    expect(list[0]?.id).toBe("device:a");
  });

  it("reflects device moves applied through mapOperations", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:patch", "PC", 0);
    counter += 1;

    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.patch",
        meta: meta(),
        deviceId: id,
        patch: { position: { x: 200, y: 300 } },
      },
    });

    const list = await t.query(api.devices.listForFloor, { floorId });
    expect(list[0]).toMatchObject({ name: "PC", position: { x: 200, y: 300 } });
  });

  it("shows placed devices with their identity and leaves unplaced ones out", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.run(async (ctx) => {
      const identity = {
        siteId: "site:test",
        type: "pc" as const,
        metadata: {},
        updatedAt: 1,
        updatedBy: "test",
      };
      await ctx.db.insert("devices", {
        ...identity,
        objectId: "device:placed",
        name: "Placed",
        macs: ["02:00:00:00:00:01"],
        ip: "192.0.2.5",
        serial: "SN-1",
        placement: {
          floorId,
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
        },
      });
      await ctx.db.insert("devices", {
        ...identity,
        objectId: "device:unplaced",
        name: "Unplaced",
        macs: [],
      });
    });

    const [devices, mapDevices] = await Promise.all([
      t.query(api.devices.listForFloor, { floorId }),
      t.query(api.mapDocument.getFloorDevices, { floorId }),
    ]);
    expect(devices).toEqual(mapDevices);
    expect(mapDevices).toEqual([
      {
        id: "device:placed",
        floorId,
        type: "pc",
        name: "Placed",
        serial: "SN-1",
        macs: ["02:00:00:00:00:01"],
        ip: "192.0.2.5",
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {},
      },
    ]);
  });
});
