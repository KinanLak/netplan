import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";
import { portIdOf } from "../src/devices/ports";
import type { DeviceId, DeviceType } from "../src/types/map";

let counter = 0;

async function freshFloor(t: TestClient) {
  counter += 1;
  const siteId = await createTestSite(t);
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
    objectId: `building:cables:${counter}`,
    name: "Bâtiment A",
  });
  return await t.mutation(api.floors.create, {
    objectId: `floor:cables:${counter}`,
    buildingId,
    name: "RDC",
  });
}

const placeDevice = async (
  t: TestClient,
  floorId: string,
  id: string,
  type: DeviceType,
  x: number,
) => {
  counter += 1;
  await t.mutation(api.mapOperations.apply, {
    operation: {
      kind: "device.create",
      meta: {
        opId: `op:cables:${counter}`,
        clientId: "client:cables",
        clientSeq: counter,
        createdAt: counter,
      },
      device: {
        id,
        floorId,
        type,
        name: id.slice("device:".length),
        position: { x, y: 0 },
        size: { width: 80, height: 80 },
        macs: [],
        metadata: {},
      },
    },
  });
};

const end = (
  deviceId: string,
  kind: "interface" | "front" | "rear",
  n = 1,
) => ({
  deviceId,
  portId: portIdOf(deviceId as DeviceId, kind, n),
});

/** A switch cabled to a socket through a patch panel. */
async function cabledRun(t: TestClient) {
  const floorId = await freshFloor(t);
  await placeDevice(t, floorId, "device:sw", "switch", 0);
  await placeDevice(t, floorId, "device:panel", "patch-panel", 200);
  await placeDevice(t, floorId, "device:socket", "wall-port", 400);
  await t.mutation(api.cables.connect, {
    id: "cable:sw-panel",
    a: end("device:sw", "interface"),
    b: end("device:panel", "rear"),
  });
  await t.mutation(api.cables.connect, {
    id: "cable:panel-socket",
    a: end("device:panel", "front"),
    b: end("device:socket", "front"),
  });
  return floorId;
}

const portOf = async (t: TestClient, deviceId: string, portId: string) => {
  const table = await t.query(api.cables.portTable, { deviceId });
  return table?.ports.find((port) => port.id === portId);
};

describe("cables", () => {
  it("traces a switch port through a patch panel to its socket, both ways", async () => {
    const t = await signedInTest();
    await cabledRun(t);

    const switchPort = await portOf(
      t,
      "device:sw",
      end("device:sw", "interface").portId,
    );
    expect(switchPort?.cable?.far).toMatchObject({
      deviceName: "panel",
      portName: "1",
      portKind: "rear",
      place: "Bâtiment A · RDC",
    });
    expect(switchPort?.traceEnd).toMatchObject({
      deviceId: "device:socket",
      portId: end("device:socket", "front").portId,
    });

    const socketPort = await portOf(
      t,
      "device:socket",
      end("device:socket", "front").portId,
    );
    expect(socketPort?.cable?.far.deviceId).toBe("device:panel");
    expect(socketPort?.traceEnd?.portId).toBe(
      end("device:sw", "interface").portId,
    );

    // Its far end is where it stops: no trace beyond it.
    const panelFront = await portOf(
      t,
      "device:panel",
      end("device:panel", "front").portId,
    );
    expect(panelFront?.traceEnd).toBeNull();
  });

  it("names a far end on no floor, and lists uncabled ports", async () => {
    const t = await signedInTest();
    await cabledRun(t);
    counter += 1;
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.unplace",
        meta: {
          opId: `op:cables:${counter}`,
          clientId: "client:cables",
          clientSeq: counter,
          createdAt: counter,
        },
        deviceId: "device:socket",
      },
    });

    const table = await t.query(api.cables.portTable, {
      deviceId: "device:panel",
    });
    const front = table?.ports.find(
      (port) => port.id === end("device:panel", "front").portId,
    );
    expect(front?.cable?.far).toMatchObject({
      deviceId: "device:socket",
      place: null,
    });
    expect(table?.ports).toHaveLength(48);
    expect(table?.ports.filter((port) => port.cable)).toHaveLength(2);
    expect(
      await t.query(api.cables.portTable, { deviceId: "device:gone" }),
    ).toBeNull();
  });

  it("says what the network saw on a switch port and behind a socket, and where a device was last seen", async () => {
    const t = await signedInTest();
    const floorId = await cabledRun(t);
    counter += 1;
    await t.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: {
          opId: `op:cables:${counter}`,
          clientId: "client:cables",
          clientSeq: counter,
          createdAt: counter,
        },
        device: {
          id: "device:pc",
          floorId,
          type: "pc",
          name: "pc-1",
          position: { x: 600, y: 0 },
          size: { width: 80, height: 80 },
          macs: ["02:00:00:00:00:01"],
          metadata: {},
        },
      },
    });
    const switchPortId = end("device:sw", "interface").portId;
    await t.run(async (ctx) => {
      const sw = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", "device:sw"))
        .unique();
      const base = {
        siteId: sw!.siteId,
        switchId: "device:sw",
        portId: switchPortId,
        socketId: "device:socket",
      };
      await ctx.db.insert("macSightings", {
        ...base,
        mac: "02:00:00:00:00:01",
        seenAt: 2_000,
        misses: 0,
      });
      // A MAC no device carries, seen earlier.
      await ctx.db.insert("macSightings", {
        ...base,
        mac: "02:00:00:00:00:99",
        seenAt: 1_000,
        misses: 3,
      });
    });

    const switchPort = await portOf(t, "device:sw", switchPortId);
    expect(switchPort?.observed).toEqual([
      { deviceId: "device:pc", name: "pc-1", at: 2_000, current: true },
      { name: "02:00:00:00:00:99", at: 1_000, current: false },
    ]);
    const socketPort = await portOf(
      t,
      "device:socket",
      end("device:socket", "front").portId,
    );
    expect(socketPort?.observed.map((seen) => seen.name)).toEqual([
      "pc-1",
      "02:00:00:00:00:99",
    ]);
    // A source may model a socket with a rear port alone.
    await t.run(async (ctx) => {
      const port = await ctx.db
        .query("ports")
        .withIndex("by_device", (q) => q.eq("deviceId", "device:socket"))
        .unique();
      if (port) await ctx.db.patch(port._id, { kind: "rear" });
    });
    const rearOnly = await t.query(api.cables.portTable, {
      deviceId: "device:socket",
    });
    expect(rearOnly?.ports[0]?.observed).toHaveLength(2);
    // The panel's ports see nothing themselves.
    const panelFront = await portOf(
      t,
      "device:panel",
      end("device:panel", "front").portId,
    );
    expect(panelFront?.observed).toEqual([]);

    const pc = await t.query(api.cables.portTable, { deviceId: "device:pc" });
    expect(pc?.lastSeen).toMatchObject({
      at: 2_000,
      current: true,
      place: { switchName: "sw", portName: "1", socketName: "socket" },
    });
    expect(
      (await t.query(api.cables.portTable, { deviceId: "device:sw" }))
        ?.lastSeen,
    ).toBeNull();
  });

  it("refuses a cable to a taken, missing or same port, across sites, or with a taken id", async () => {
    const t = await signedInTest();
    await cabledRun(t);
    const other = await freshFloor(t);
    await placeDevice(t, other, "device:far", "pc", 0);
    const free = end("device:sw", "interface", 2);

    const refusal = (
      a: { deviceId: string; portId: string },
      b: { deviceId: string; portId: string },
      id = "cable:new",
    ) => t.mutation(api.cables.connect, { id, a, b });

    await expect(refusal(free, end("device:panel", "rear"))).rejects.toThrow(
      "déjà câblé",
    );
    await expect(refusal(free, free)).rejects.toThrow("deux ports différents");
    await expect(
      refusal(free, end("device:panel", "rear", 99)),
    ).rejects.toThrow("n'existe plus");
    // A port id under another device's name is not that device's port.
    await expect(
      refusal(free, {
        deviceId: "device:panel",
        portId: end("device:sw", "interface", 3).portId,
      }),
    ).rejects.toThrow("n'existe plus");
    await expect(refusal(free, end("device:far", "interface"))).rejects.toThrow(
      "même site",
    );
    await expect(
      refusal(free, end("device:panel", "rear", 2), "cable:sw-panel"),
    ).rejects.toThrow("déjà pris");
    await expect(
      refusal(free, end("device:panel", "rear", 2), "link:new"),
    ).rejects.toThrow("Cet identifiant de câble est invalide.");
  });

  it("disconnects a manual cable and connects it back as it was", async () => {
    const t = await signedInTest();
    const floorId = await cabledRun(t);

    const removed = await t.mutation(api.cables.disconnect, {
      cableId: "cable:panel-socket",
    });
    expect(removed).toEqual({
      id: "cable:panel-socket",
      a: end("device:panel", "front"),
      b: end("device:socket", "front"),
    });
    expect(
      await t.mutation(api.cables.disconnect, {
        cableId: "cable:panel-socket",
      }),
    ).toBeNull();
    const floorCables = await t.query(api.mapDocument.getFloorCables, {
      floorId,
    });
    expect(floorCables.map((cable) => cable.id)).toEqual(["cable:sw-panel"]);

    if (!removed) throw new Error("expected the removed cable");
    await t.mutation(api.cables.connect, removed);
    const socket = await portOf(
      t,
      "device:socket",
      end("device:socket", "front").portId,
    );
    expect(socket?.cable?.id).toBe("cable:panel-socket");
  });

  it("leaves a source's cable to its source", async () => {
    const t = await signedInTest();
    await cabledRun(t);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("cables")
        .withIndex("by_object_id", (q) => q.eq("objectId", "cable:sw-panel"))
        .unique();
      if (!row) throw new Error("expected the cable");
      await ctx.db.patch(row._id, {
        source: { integration: "netbox", externalId: "42" },
      });
    });

    await expect(
      t.mutation(api.cables.disconnect, { cableId: "cable:sw-panel" }),
    ).rejects.toThrow("NetBox");
  });

  it("lets only an éditeur change cables", async () => {
    const reader = await signedInTest("reader");
    await expect(
      reader.mutation(api.cables.connect, {
        id: "cable:x",
        a: end("device:a", "interface"),
        b: end("device:b", "interface"),
      }),
    ).rejects.toThrow();
    await expect(
      reader.mutation(api.cables.disconnect, { cableId: "cable:x" }),
    ).rejects.toThrow();
  });
});
