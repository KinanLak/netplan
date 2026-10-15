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
  macs: Array<string> = [],
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
        macs,
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

describe("devices.updateIdentity", () => {
  const MAC_A = "02:ab:cd:00:00:0a";
  const MAC_B = "02:ab:cd:00:00:0b";

  const deviceRow = async (t: TestClient, objectId: string) =>
    await t.run(
      async (ctx) =>
        await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
    );

  it("edits a manual device, trims text and clears emptied fields", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:id:edit", "PC", 0);
    await t.mutation(api.devices.updateIdentity, {
      deviceId: id,
      edit: { name: " Accueil ", hostname: "pc-accueil", notes: "Bureau 4" },
    });
    await t.mutation(api.devices.updateIdentity, {
      deviceId: id,
      edit: { hostname: "  ", serial: "SN-9" },
    });

    const [device] = await t.query(api.devices.listForFloor, { floorId });
    expect(device).toMatchObject({
      name: "Accueil",
      serial: "SN-9",
      notes: "Bureau 4",
    });
    expect(device.hostname).toBeUndefined();
  });

  it("moves MAC addresses between devices of a site, never sharing one", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const a = await createDevice(t, floorId, "device:id:a", "A", 0, [MAC_A]);
    const b = await createDevice(t, floorId, "device:id:b", "B", 200);

    await expect(
      t.mutation(api.devices.updateIdentity, {
        deviceId: b,
        edit: { macs: [MAC_A] },
      }),
    ).rejects.toThrow(`L'adresse MAC ${MAC_A} est déjà celle de A.`);

    await t.mutation(api.devices.updateIdentity, {
      deviceId: a,
      edit: { macs: [MAC_B] },
    });
    await t.mutation(api.devices.updateIdentity, {
      deviceId: b,
      edit: { macs: [MAC_A] },
    });

    const owners = await t.run(
      async (ctx) => await ctx.db.query("deviceMacs").collect(),
    );
    expect(
      owners.map(({ mac, deviceId }) => `${mac}=${deviceId}`).sort(),
    ).toEqual([`${MAC_A}=${b}`, `${MAC_B}=${a}`]);
  });

  it("refuses to change what the device's source owns, and nothing else", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:id:src", "Sw", 0, [
      MAC_A,
    ]);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", id))
        .unique();
      if (!row) throw new Error("missing device");
      await ctx.db.patch(row._id, {
        source: { integration: "netbox", externalId: "12", syncedAt: 0 },
      });
    });

    await expect(
      t.mutation(api.devices.updateIdentity, {
        deviceId: id,
        edit: { name: "Autre" },
      }),
    ).rejects.toThrow("Le champ « nom » vient de NetBox");
    await expect(
      t.mutation(api.devices.updateIdentity, {
        deviceId: id,
        edit: { macs: [] },
      }),
    ).rejects.toThrow("Le champ « adresses MAC » vient de NetBox");

    // The drawer sends its whole form: unchanged owned fields pass.
    await t.mutation(api.devices.updateIdentity, {
      deviceId: id,
      edit: {
        name: "Sw",
        macs: [MAC_A],
        hostname: "sw-1",
        notes: "Baie 2",
      },
    });
    expect(await deviceRow(t, id)).toMatchObject({
      name: "Sw",
      hostname: "sw-1",
      notes: "Baie 2",
    });
  });

  it("refuses an empty name, overlong text and malformed MACs", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:id:bad", "PC", 0);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: "  " }, "Le nom est obligatoire."],
      [
        { notes: "x".repeat(2001) },
        "Trop long : notes (2000 caractères au plus).",
      ],
      [{ macs: ["02:AB:CD:00:00:0A"] }, "Une adresse MAC n'est pas valide."],
      [{ macs: [MAC_A, MAC_A] }, "Une adresse MAC est en double."],
    ];
    for (const [edit, message] of cases) {
      await expect(
        t.mutation(api.devices.updateIdentity, { deviceId: id, edit }),
      ).rejects.toThrow(message);
    }
    expect(await deviceRow(t, id)).toMatchObject({ name: "PC", macs: [] });
  });
});
