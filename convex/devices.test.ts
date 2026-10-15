import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { signedInTest, ensureDefaultSite } from "./_test/auth.setup";
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
  const siteId = await ensureDefaultSite(t);
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

  it("reflects device patches applied through mapOperations", async () => {
    const t = await signedInTest();
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

  it("never exposes MAC addresses from public device queries", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:private-mac",
        floorId,
        type: "pc",
        name: "Private inventory",
        position: { x: 0, y: 0 },
        size: { width: 80, height: 80 },
        metadata: {
          ip: "192.0.2.5",
          macs: ["AA:BB:CC:DD:EE:FF"],
        },
        updatedAt: 1,
        updatedBy: "test",
      });
    });

    const [devices, mapDevices] = await Promise.all([
      t.query(api.devices.listForFloor, { floorId }),
      t.query(api.mapDocument.getFloorDevices, { floorId }),
    ]);
    expect(devices[0]?.metadata).toEqual({ ip: "192.0.2.5" });
    expect(mapDevices[0]?.metadata).toEqual({ ip: "192.0.2.5" });
    expect(Object.hasOwn(devices[0]?.metadata ?? {}, "macs")).toBe(false);
    expect(Object.hasOwn(mapDevices[0]?.metadata ?? {}, "macs")).toBe(false);
  });
});
