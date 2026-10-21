import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";
import { portIdOf } from "../src/devices/ports";
import type { DeviceId, DeviceType } from "../src/types/map";

let counter = 0;

const placeDevice = async (
  t: TestClient,
  floorId: string,
  id: string,
  type: DeviceType,
  macs: Array<string> = [],
) => {
  counter += 1;
  await t.mutation(api.mapOperations.apply, {
    operation: {
      kind: "device.create",
      meta: {
        opId: `op:path-ends:${counter}`,
        clientId: "client:path-ends",
        clientSeq: counter,
        createdAt: counter,
      },
      device: {
        id,
        floorId,
        type,
        name: id.slice("device:".length),
        position: { x: counter * 100, y: 0 },
        size: { width: 40, height: 40 },
        macs,
        metadata: {},
      },
    },
  });
};

const end = (deviceId: string, kind: "interface" | "front" | "rear") => ({
  deviceId,
  portId: portIdOf(deviceId as DeviceId, kind, 1),
});

const sighting = (
  siteId: string,
  mac: string,
  socketId: string | undefined,
  misses: number,
) => ({
  siteId,
  mac,
  switchId: "device:sw",
  portId: portIdOf("device:sw" as DeviceId, "interface", 1),
  ...(socketId === undefined ? {} : { socketId }),
  seenAt: 1000 - misses,
  misses,
});

/**
 * A ground floor with a patch panel, two sockets and a PC; the switch the
 * panel's rear runs to is upstairs.
 */
async function twoFloors() {
  const t = await signedInTest();
  const siteId = await createTestSite(t);
  const buildingId = await t.mutation(api.buildings.create, {
    siteId,
    objectId: "building:path-ends",
    name: "Bâtiment A",
  });
  const ground = await t.mutation(api.floors.create, {
    objectId: "floor:path-ends:0",
    buildingId,
    name: "RDC",
  });
  const upstairs = await t.mutation(api.floors.create, {
    objectId: "floor:path-ends:1",
    buildingId,
    name: "Étage 1",
  });
  await placeDevice(t, upstairs, "device:sw", "switch");
  await placeDevice(t, ground, "device:panel", "patch-panel");
  await placeDevice(t, ground, "device:old-socket", "wall-port");
  await placeDevice(t, ground, "device:socket", "wall-port");
  await placeDevice(t, ground, "device:pc", "pc", [
    "aa:aa:aa:aa:aa:01",
    "aa:aa:aa:aa:aa:02",
  ]);
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
  return { t, siteId, ground, upstairs };
}

describe("getFloorPathEnds", () => {
  it("names the far end of each cable that leaves the floor", async () => {
    const { t, ground, upstairs } = await twoFloors();
    const { farEnds } = await t.query(api.mapDocument.getFloorPathEnds, {
      floorId: ground,
    });
    expect(farEnds).toEqual([
      {
        portId: portIdOf("device:sw" as DeviceId, "interface", 1),
        portName: "1",
        deviceId: "device:sw",
        deviceName: "sw",
        floorName: "Étage 1",
      },
    ]);

    // Upstairs, the panel is the far end.
    const above = await t.query(api.mapDocument.getFloorPathEnds, {
      floorId: upstairs,
    });
    expect(above.farEnds).toMatchObject([
      { deviceId: "device:panel", floorName: "RDC" },
    ]);
  });

  it("locates a PC at the socket of its most recently seen MAC", async () => {
    const { t, siteId, ground } = await twoFloors();
    const seenAt = async () =>
      (await t.query(api.mapDocument.getFloorPathEnds, { floorId: ground }))
        .seenAt;
    expect(await seenAt()).toEqual([]);

    await t.run(async (ctx) => {
      await ctx.db.insert(
        "macSightings",
        sighting(siteId, "aa:aa:aa:aa:aa:01", "device:old-socket", 3),
      );
      // Seen more recently, but on a port that reaches no socket.
      await ctx.db.insert(
        "macSightings",
        sighting(siteId, "aa:aa:aa:aa:aa:02", undefined, 0),
      );
    });
    expect(await seenAt()).toEqual([
      {
        deviceId: "device:pc",
        socketId: "device:old-socket",
        socketName: "old-socket",
        floorName: "RDC",
      },
    ]);

    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("macSightings")
        .withIndex("by_site_mac", (q) =>
          q.eq("siteId", siteId).eq("mac", "aa:aa:aa:aa:aa:02"),
        )
        .unique();
      if (row) await ctx.db.patch(row._id, { socketId: "device:socket" });
    });
    expect(await seenAt()).toMatchObject([{ socketId: "device:socket" }]);
  });
});

describe("getFloorSeenSockets", () => {
  it("names a socket seen behind, whoever owns the MAC, while its read vouches for it", async () => {
    const { t, siteId, ground } = await twoFloors();
    const seenSockets = () =>
      t.query(api.mapDocument.getFloorSeenSockets, { floorId: ground });
    const readSwitch = (readAt: number) =>
      t.run(async (ctx) => {
        const cycle = await ctx.db.query("siteCycles").first();
        const switchReads = [{ switchId: "device:sw", readAt }];
        if (cycle) await ctx.db.patch(cycle._id, { switchReads });
        else {
          await ctx.db.insert("siteCycles", {
            siteId,
            nextRunAt: 0,
            failures: 0,
            switchReads,
          });
        }
      });

    await t.run(async (ctx) => {
      // A MAC no device owns, seen now; another missed in the last read.
      await ctx.db.insert(
        "macSightings",
        sighting(siteId, "bb:bb:bb:bb:bb:01", "device:socket", 0),
      );
      await ctx.db.insert(
        "macSightings",
        sighting(siteId, "bb:bb:bb:bb:bb:02", "device:old-socket", 2),
      );
    });
    // No read vouches for the sighting yet.
    expect(await seenSockets()).toEqual([]);

    await readSwitch(Date.now());
    expect(await seenSockets()).toEqual(["device:socket"]);

    // A read that has gone stale vouches for nothing.
    await readSwitch(0);
    expect(await seenSockets()).toEqual([]);
  });
});
