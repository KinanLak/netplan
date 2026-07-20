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
  const siteId = await t.mutation(api.sites.ensureDefault, {});
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

  it("never exposes MAC addresses from public device queries", async () => {
    const t = convexTest(schema, modules);
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

  it("joins current exact NetBox source fields without mutating map-owned fields", async () => {
    const t = convexTest(schema, modules);
    const siteId = await t.mutation(api.sites.ensureDefault, {});
    const buildingId = await t.mutation(api.buildings.create, {
      siteId,
      objectId: `building:presentation:${counter}`,
      name: "Presentation",
    });
    const floorId = await t.mutation(api.floors.create, {
      buildingId,
      objectId: `floor:presentation:${counter}`,
      name: "Presentation",
    });
    const source = {
      provider: "netbox" as const,
      siteId,
      instanceKey: "netbox-main",
      externalId: "device:source-joined",
      url: "https://netbox.example/stale",
      location: "Stale",
      locationPath: ["Stale"],
      role: "Stale role",
      lifecycleStatus: "stale",
      syncedAt: 1,
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "device:source-joined",
        floorId,
        type: "pc",
        name: "Durable stale name",
        hostname: "durable-stale-host",
        position: { x: 120, y: 240 },
        size: { width: 200, height: 200 },
        metadata: {
          ip: "192.0.2.1",
          model: "Durable stale model",
          status: "up",
          lastUser: "map-owner",
          macs: ["AA:BB:CC:DD:EE:FF"],
          source,
        },
        updatedAt: 1,
        updatedBy: "user",
      });
      await ctx.db.insert("externalObjectBindings", {
        siteId,
        provider: "netbox",
        instanceKey: source.instanceKey,
        externalId: source.externalId,
        deviceId: "device:source-joined",
        floorId,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("netboxInventory", {
        siteId,
        generationId: "generation:wrong-instance",
        instanceKey: "netbox-other",
        provider: "netbox",
        externalId: source.externalId,
        type: "pc",
        name: "Must not leak",
        role: "Wrong instance",
        locationPath: [],
        macs: ["11:22:33:44:55:66"],
        interfaceCount: 1,
        cabledTerminationCount: 0,
        lifecycleStatus: "active",
        url: "https://other.example/device",
        capturedAt: 2,
      });
      const workflow = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", siteId).eq("workflow", "netbox"),
        )
        .unique();
      if (!workflow) throw new Error("Missing NetBox workflow");
      await ctx.db.patch(workflow._id, {
        lastPublishedId: "generation:wrong-instance",
      });
    });

    expect(
      (await t.query(api.mapDocument.getFloorDevices, { floorId }))[0]?.name,
    ).toBe("Durable stale name");

    await t.run(async (ctx) => {
      await ctx.db.insert("netboxInventory", {
        siteId,
        generationId: "generation:current",
        instanceKey: source.instanceKey,
        provider: "netbox",
        externalId: source.externalId,
        type: "pc",
        name: "Current source name",
        hostname: "current-host",
        model: "Current model",
        role: "Workstation",
        location: "Office 42",
        locationPath: ["Building", "Office 42"],
        ip: "198.51.100.42",
        macs: ["AA:BB:CC:DD:EE:FF"],
        interfaceCount: 1,
        cabledTerminationCount: 0,
        lifecycleStatus: "active",
        url: "https://netbox.example/current",
        capturedAt: 42,
      });
      const workflow = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", siteId).eq("workflow", "netbox"),
        )
        .unique();
      if (!workflow) throw new Error("Missing NetBox workflow");
      await ctx.db.patch(workflow._id, {
        lastPublishedId: "generation:current",
      });
    });

    const [presented] = await t.query(api.mapDocument.getFloorDevices, {
      floorId,
    });
    expect(presented).toMatchObject({
      name: "Current source name",
      hostname: "current-host",
      position: { x: 120, y: 240 },
      size: { width: 200, height: 200 },
      metadata: {
        ip: "198.51.100.42",
        model: "Current model",
        status: "up",
        lastUser: "map-owner",
        source: {
          siteId,
          instanceKey: source.instanceKey,
          externalId: source.externalId,
          url: "https://netbox.example/current",
          location: "Office 42",
          locationPath: ["Building", "Office 42"],
          role: "Workstation",
          lifecycleStatus: "active",
          syncedAt: 42,
        },
      },
    });
    expect(Object.hasOwn(presented.metadata, "macs")).toBe(false);
    await t.run(async (ctx) => {
      const durable = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) =>
          q.eq("objectId", "device:source-joined"),
        )
        .unique();
      expect(durable).toMatchObject({
        name: "Durable stale name",
        position: { x: 120, y: 240 },
        size: { width: 200, height: 200 },
      });
    });
  });
});
