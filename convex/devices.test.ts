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
    // Named after its hostname while it had one (B10), it keeps that name.
    expect(device).toMatchObject({
      name: "pc-accueil",
      serial: "SN-9",
      notes: "Bureau 4",
    });
    expect(device.hostname).toBeUndefined();
  });

  it("names a manual device after its hostname, whatever name it is given", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:id:host", "PC", 0);
    await t.mutation(api.devices.updateIdentity, {
      deviceId: id,
      edit: { hostname: "pc-0042" },
    });
    await t.mutation(api.devices.updateIdentity, {
      deviceId: id,
      edit: { name: "Accueil" },
    });
    const [device] = await t.query(api.devices.listForFloor, { floorId });
    expect(device).toMatchObject({ name: "pc-0042", hostname: "pc-0042" });
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
    ).rejects.toThrow("« nom »");
    await expect(
      t.mutation(api.devices.updateIdentity, {
        deviceId: id,
        edit: { macs: [] },
      }),
    ).rejects.toThrow("« adresses MAC »");

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

  it("refuses an empty name, overlong text, a malformed IP and malformed MACs", async () => {
    const t = await signedInTest();
    const floorId = await freshFloor(t);
    const id = await createDevice(t, floorId, "device:id:bad", "PC", 0);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: "  " }, "Le nom est obligatoire."],
      [
        { notes: "x".repeat(2001) },
        "Le champ « notes » dépasse 2000 caractères.",
      ],
      [{ ip: "999.1.1" }, "« 999.1.1 » n'est pas une adresse IP."],
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

describe("the site inventory", () => {
  const MAC = "02:ab:cd:00:00:09";

  const identity = (name: string, macs: Array<string> = []) => ({
    name,
    macs,
  });

  async function siteWithFloor(t: TestClient) {
    counter += 1;
    const siteId = await createTestSite(t);
    const buildingId = await t.mutation(api.buildings.create, {
      siteId,
      objectId: `building:inventory:${counter}`,
      name: "Bâtiment B",
    });
    const floorId = await t.mutation(api.floors.create, {
      objectId: `floor:inventory:${counter}`,
      buildingId,
      name: "Étage 2",
    });
    return { siteId, floorId };
  }

  it("lists a site's devices with where they stand, or none", async () => {
    const t = await signedInTest();
    const { siteId, floorId } = await siteWithFloor(t);
    const other = await siteWithFloor(t);
    await createDevice(t, floorId, "device:placed", "PC-Placé", 0);
    await createDevice(t, other.floorId, "device:other", "PC-Ailleurs", 0);
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:stored",
      type: "endpoint",
      identity: { ...identity(" Imprimante ", [MAC]), hostname: " " },
    });

    const list = await t.query(api.devices.listForSite, { siteId });

    expect(list.toSorted((a, b) => a.id.localeCompare(b.id))).toMatchObject([
      {
        id: "device:placed",
        location: { floorId, buildingName: "Bâtiment B", floorName: "Étage 2" },
      },
      {
        id: "device:stored",
        type: "endpoint",
        name: "Imprimante",
        macs: [MAC],
        location: null,
      },
    ]);
    expect(list.find((item) => item.id === "device:stored")?.hostname).toBe(
      undefined,
    );
  });

  it("says when the network last saw each device, by its latest MAC", async () => {
    const t = await signedInTest();
    const { siteId } = await siteWithFloor(t);
    const OTHER = "02:ab:cd:00:00:0a";
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:seen",
      type: "pc",
      identity: identity("Vu", [MAC, OTHER]),
    });
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:never",
      type: "pc",
      identity: identity("Jamais vu"),
    });
    await t.run(async (ctx) => {
      for (const [mac, seenAt] of [
        [MAC, 1_000],
        [OTHER, 5_000],
      ] as const) {
        await ctx.db.insert("macSightings", {
          siteId,
          mac,
          switchId: "device:sw",
          portId: "port:1",
          seenAt,
          misses: 0,
        });
      }
    });

    const list = await t.query(api.devices.listForSite, { siteId });
    expect(list.find(({ id }) => id === "device:seen")?.seenAt).toBe(5_000);
    expect(
      list.find(({ id }) => id === "device:never")?.seenAt,
    ).toBeUndefined();
  });

  it("counts the site's devices that stand on no floor", async () => {
    const t = await signedInTest();
    const { siteId, floorId } = await siteWithFloor(t);
    expect(await t.query(api.devices.unplacedCount, { siteId })).toBe(0);
    await createDevice(t, floorId, "device:placed", "PC-1", 0);
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:stored",
      type: "endpoint",
      identity: identity("PC-2"),
    });
    expect(await t.query(api.devices.unplacedCount, { siteId })).toBe(1);
  });

  it("tells the floor of a placed device of the site, and nothing else", async () => {
    const t = await signedInTest();
    const { siteId, floorId } = await siteWithFloor(t);
    await createDevice(t, floorId, "device:on-floor", "PC-1", 0);
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:off-floor",
      type: "endpoint",
      identity: identity("PC-2"),
    });
    const otherSite = await createTestSite(t);
    const floorOf = (site: string, deviceId: string) =>
      t.query(api.devices.floorOf, { siteId: site, deviceId });

    expect(await floorOf(siteId, "device:on-floor")).toBe(floorId);
    expect(await floorOf(siteId, "device:off-floor")).toBeNull();
    expect(await floorOf(siteId, "device:missing")).toBeNull();
    // A link whose site and device disagree opens nothing on another site.
    expect(await floorOf(otherSite, "device:on-floor")).toBeNull();
  });

  it("tells where and when the network last saw a device", async () => {
    const t = await signedInTest();
    const { siteId, floorId } = await siteWithFloor(t);
    await createDevice(t, floorId, "device:seen", "PC-Vu", 0, [MAC]);
    await createDevice(t, floorId, "device:never", "PC-Jamais", 100);
    await t.run(async (ctx) => {
      await ctx.db.insert("macSightings", {
        siteId,
        mac: MAC,
        switchId: "device:never",
        portId: "port:none",
        seenAt: 5_000,
        misses: 3,
      });
    });
    // A Lecteur reads it too: `authorization.test.ts` lists it as "reader".
    expect(
      await t.query(api.devices.lastSeen, { deviceId: "device:seen" }),
    ).toMatchObject({
      at: 5_000,
      current: false,
      place: { switchName: "PC-Jamais", portName: "port:none" },
    });
    expect(
      await t.query(api.devices.lastSeen, { deviceId: "device:never" }),
    ).toBeNull();
  });

  it("refuses a device whose MAC another device of the site carries", async () => {
    const t = await signedInTest();
    const { siteId, floorId } = await siteWithFloor(t);
    await createDevice(t, floorId, "device:owner", "PC-MAC", 0, [MAC]);

    const attempt = (
      deviceId: string,
      name: string,
      macs: Array<string> = [],
    ) =>
      t.mutation(api.devices.create, {
        siteId,
        deviceId,
        type: "pc",
        identity: identity(name, macs),
      });

    await expect(attempt("device:copy", "Copie", [MAC])).rejects.toThrow(
      "déjà celle de PC-MAC",
    );
    await expect(attempt("device:nameless", "  ")).rejects.toThrow(
      "Le nom est obligatoire",
    );
    await expect(attempt("device:owner", "Doublon")).rejects.toThrow(
      "déjà pris",
    );
  });

  it("keeps creating to éditeurs", async () => {
    const reader = await signedInTest("reader");
    const siteId = await createTestSite(reader);

    await expect(
      reader.mutation(api.devices.create, {
        siteId,
        deviceId: "device:reader",
        type: "pc",
        identity: identity("Lecteur"),
      }),
    ).rejects.toThrow();
  });

  it("deletes a manual device off the map and frees its MACs, so it can come back", async () => {
    const t = await signedInTest();
    const { siteId } = await siteWithFloor(t);
    const args = {
      siteId,
      deviceId: "device:gone",
      type: "pc" as const,
      identity: identity("Parti", [MAC]),
    };
    await t.mutation(api.devices.create, args);

    await t.mutation(api.devices.remove, { deviceId: "device:gone" });
    const afterRemove = await t.query(api.devices.listForSite, { siteId });
    await t.mutation(api.devices.create, args);
    const afterRestore = await t.query(api.devices.listForSite, { siteId });

    expect(afterRemove).toEqual([]);
    expect(afterRestore).toMatchObject([{ id: "device:gone", macs: [MAC] }]);
  });

  it("hands back what brings a deleted device back whole, cables included", async () => {
    const t = await signedInTest();
    const { siteId } = await siteWithFloor(t);
    const port = (n: number) => ({
      id: `port:device:switch:interface:${n}`,
      deviceId: "device:switch",
      name: `Gi1/0/${n}`,
      kind: "interface" as const,
      order: n,
      status: "up" as const,
    });
    const cable = {
      id: "cable:switch-pc",
      a: { deviceId: "device:pc", portId: "port:device:pc:interface:1" },
      b: { deviceId: "device:switch", portId: port(1).id },
    };
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:switch",
      type: "switch",
      identity: { ...identity("Switch", [MAC]), serial: "SN-1" },
      metadata: { status: "up" },
      ports: [port(1), port(2)],
    });
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:pc",
      type: "pc",
      identity: identity("PC", []),
      cables: [cable],
    });
    const rows = async () =>
      await t.run(async (ctx) => ({
        device: await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) => q.eq("objectId", "device:switch"))
          .unique(),
        ports: (await ctx.db.query("ports").collect()).map(
          (row) => row.objectId,
        ),
        cables: (await ctx.db.query("cables").collect()).map(
          (row) => row.objectId,
        ),
      }));
    const before = await rows();
    expect(before.cables).toEqual([cable.id]);

    const removed = await t.mutation(api.devices.remove, {
      deviceId: "device:switch",
    });
    expect(await rows()).toMatchObject({
      device: null,
      ports: ["port:device:pc:interface:1"],
      cables: [],
    });
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:switch",
      ...removed!,
    });
    const after = await rows();

    const { _id, _creationTime, updatedAt, ...kept } = before.device!;
    expect(after.device).toMatchObject(kept);
    expect(after.ports.sort()).toEqual(before.ports.sort());
    expect(after.cables).toEqual([cable.id]);
  });

  it("leaves out a cable whose far port holds another since, and refuses a taken port id", async () => {
    const t = await signedInTest();
    const { siteId } = await siteWithFloor(t);
    const cableTo = (id: string, deviceId: string) => ({
      id,
      a: { deviceId, portId: `port:${deviceId}:interface:1` },
      b: { deviceId: "device:hub", portId: "port:device:hub:interface:1" },
    });
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:hub",
      type: "switch",
      identity: identity("Hub", []),
    });
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:first",
      type: "pc",
      identity: identity("Premier", []),
      cables: [cableTo("cable:first", "device:first")],
    });

    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:second",
      type: "pc",
      identity: identity("Second", []),
      cables: [cableTo("cable:second", "device:second")],
    });
    // `device:hub:interface`'s own port 1 has the id of the hub's port 1.
    await expect(
      t.mutation(api.devices.create, {
        siteId,
        deviceId: "device:hub:interface",
        type: "pc",
        identity: identity("Imposteur", []),
        ports: [
          {
            id: "port:device:hub:interface:1",
            deviceId: "device:hub:interface",
            name: "1",
            kind: "interface",
            order: 1,
          },
        ],
      }),
    ).rejects.toThrow("ports");

    const rows = await t.run(async (ctx) => ({
      second: await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", "device:second"))
        .unique(),
      cables: (await ctx.db.query("cables").collect()).map(
        (row) => row.objectId,
      ),
    }));
    expect(rows.second).not.toBeNull();
    expect(rows.cables).toEqual(["cable:first"]);
  });

  it("deletes neither a placed device nor one its integration owns", async () => {
    const t = await signedInTest();
    const { siteId, floorId } = await siteWithFloor(t);
    await createDevice(t, floorId, "device:on-map", "Sur le plan", 0);
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:netbox",
        siteId,
        type: "switch",
        name: "sw-netbox",
        macs: [],
        source: { integration: "netbox", externalId: "3", syncedAt: 1 },
        metadata: {},
        updatedAt: 1,
        updatedBy: "sync",
      });
    });

    await expect(
      t.mutation(api.devices.remove, { deviceId: "device:on-map" }),
    ).rejects.toThrow("depuis le plan");
    await expect(
      t.mutation(api.devices.remove, { deviceId: "device:netbox" }),
    ).rejects.toThrow("NetBox");
  });

  it("deletes an unplaced device NetBox no longer returns, and brings it back absent", async () => {
    const t = await signedInTest();
    const { siteId } = await siteWithFloor(t);
    const source = {
      integration: "netbox" as const,
      externalId: "3",
      syncedAt: 1,
      missingSince: 2,
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:absent",
        siteId,
        type: "pc",
        name: "pc-3",
        hostname: "poste-3",
        macs: [],
        source,
        metadata: {},
        updatedAt: 1,
        updatedBy: "netbox",
      });
    });

    const removed = await t.mutation(api.devices.remove, {
      deviceId: "device:absent",
    });
    expect(await t.query(api.devices.listForSite, { siteId })).toEqual([]);
    await t.mutation(api.devices.create, {
      siteId,
      deviceId: "device:absent",
      ...removed!,
    });
    // NetBox still owns its name: the hostname does not rename it.
    expect(await t.query(api.devices.listForSite, { siteId })).toMatchObject([
      {
        id: "device:absent",
        name: "pc-3",
        source: { ...source, staleId: true },
      },
    ]);
    // Back on no floor: its 30 days start again from now.
    const [restored] = await t.query(api.devices.listForSite, { siteId });
    expect(restored.source?.offPlanSince).toBeGreaterThan(2);

    await expect(
      t.mutation(api.devices.create, {
        siteId,
        deviceId: "device:forged",
        type: "pc",
        identity: { name: "pc-9", macs: [] },
        source: { ...source, externalId: "9", missingSince: undefined },
      }),
    ).rejects.toThrow("intégration");
  });
});
