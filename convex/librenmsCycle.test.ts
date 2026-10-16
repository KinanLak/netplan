import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import { randomBytes } from "node:crypto";
import { api, internal } from "./_generated/api";
import {
  createSignedInUser,
  createTestSite,
  testBackend,
} from "./_test/auth.setup";
import { stubFetch } from "./_test/fetch";
import type { TestClient } from "./_test/auth.setup";

const TOKEN = "a-token-for-tests"; // gitleaks:allow
const LIBRENMS = "https://librenms.test";
const STACK = 7;

const macOf = (n: number) => `00:11:22:33:44:${String(n).padStart(2, "0")}`;
const PC = macOf(1);
const PRINTER = macOf(2);
const STRANGER = macOf(3);

/**
 * A LibreNMS polling one device, whose forwarding table a test sets. An
 * entry without `updated_at` was refreshed by the latest discovery.
 */
function fakeLibreNMS() {
  const state = {
    fdb: [] as Array<{
      port_id: number | string;
      mac_address: string;
      updated_at?: string;
    }>,
    fdbStatus: 200,
    /** A 5xx still starts the discovery, as a proxy timing out would. */
    discoverStatus: 200,
    lastDiscovered: "2026-10-16 06:00:00",
    discoveries: 0,
    /** LibreNMS's `status`: 1 while the device answers its polls. */
    deviceStatus: 1,
  };
  const handler = (url: string) => {
    const path = new URL(url).pathname;
    if (path === "/api/v0/system") {
      return Response.json({
        status: "ok",
        system: [{ local_ver: "25.10.0" }],
      });
    }
    if (path === `/api/v0/devices/${STACK}`) {
      return Response.json({
        status: "ok",
        devices: [
          {
            device_id: STACK,
            last_discovered: state.lastDiscovered,
            status: state.deviceStatus,
          },
        ],
      });
    }
    if (path === `/api/v0/devices/${STACK}/discover`) {
      if (state.discoverStatus >= 300 && state.discoverStatus < 500) {
        return new Response("", { status: state.discoverStatus });
      }
      state.discoveries += 1;
      state.lastDiscovered = `2026-10-16 07:0${state.discoveries}:00`;
      return state.discoverStatus === 200
        ? Response.json({ status: "ok", result: { status: 0 } })
        : new Response("", { status: state.discoverStatus });
    }
    if (path === `/api/v0/devices/${STACK}/ports`) {
      return Response.json({
        status: "ok",
        ports: [
          { port_id: 101, ifName: "Gi1/0/1", ifDescr: "GigabitEthernet1/0/1" },
          { port_id: 102, ifName: "Gi1/0/2" },
          { port_id: "103", ifName: "Gi1/0/3" },
        ],
      });
    }
    if (path === `/api/v0/devices/${STACK}/fdb`) {
      return state.fdbStatus === 200
        ? Response.json({
            status: "ok",
            ports_fdb: state.fdb.map((entry) => ({
              updated_at: state.lastDiscovered,
              ...entry,
            })),
          })
        : new Response("", { status: state.fdbStatus });
    }
    return new Response("", { status: 404 });
  };
  return { state, handler };
}

let fetchStub: ReturnType<typeof stubFetch>;
let librenms: ReturnType<typeof fakeLibreNMS>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
  librenms = fakeLibreNMS();
  fetchStub = stubFetch(librenms.handler);
});

afterEach(() => {
  setSystemTime();
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
});

const port = (deviceId: string, n: number, name: string) => ({
  id: `port:${deviceId}:interface:${n}`,
  deviceId,
  name,
  kind: "interface" as const,
  order: n,
});

/**
 * A switch whose first port is cabled to a wall socket, its second free and
 * its third cabled to the core; a pc and a printer; LibreNMS mapped.
 */
async function siteWithLibreNMS() {
  const t = testBackend();
  // A session lasts a minute: a test that moves the clock signs in again.
  const signIn = async () =>
    t.withIdentity((await createSignedInUser(t, "admin")).identity);
  const admin = await signIn();
  const siteId = await createTestSite(admin);
  const create = async (
    deviceId: string,
    type: "switch" | "wall-port" | "pc" | "endpoint",
    macs: Array<string>,
    extra: object = {},
  ) =>
    await admin.mutation(api.devices.create, {
      siteId,
      deviceId,
      type,
      identity: { name: deviceId.replace("device:", ""), macs },
      ...extra,
    });
  await create("device:sw", "switch", [], {
    ports: [
      port("device:sw", 1, "GigabitEthernet1/0/1"),
      port("device:sw", 2, "GigabitEthernet1/0/2"),
      port("device:sw", 3, "GigabitEthernet1/0/3"),
    ],
  });
  await create("device:core", "switch", [], {
    ports: [port("device:core", 1, "uplink")],
    cables: [
      {
        id: "cable:uplink",
        a: { deviceId: "device:core", portId: "port:device:core:interface:1" },
        b: { deviceId: "device:sw", portId: "port:device:sw:interface:3" },
      },
    ],
  });
  await create("device:socket", "wall-port", [], {
    cables: [
      {
        id: "cable:desk",
        a: { deviceId: "device:sw", portId: "port:device:sw:interface:1" },
        b: {
          deviceId: "device:socket",
          portId: "port:device:socket:front:1",
        },
      },
    ],
  });
  await create("device:pc", "pc", [PC]);
  await create("device:printer", "endpoint", [PRINTER]);

  await admin.action(api.integrations.save, {
    siteId,
    kind: "librenms",
    baseUrl: LIBRENMS,
    enabled: true,
    token: TOKEN,
  });
  await admin.mutation(api.librenms.saveSettings, {
    siteId,
    baseUrl: LIBRENMS,
    settings: {
      switches: [
        { switchId: "device:sw", device: { id: STACK, name: "pile" } },
      ],
    },
  });
  return { admin, siteId, signIn };
}

const cycle = async (admin: TestClient, siteId: string) => {
  await admin.mutation(api.collection.refresh, { siteId });
  await admin.finishAllScheduledFunctions(() => {});
  const step = (
    await admin.query(api.collection.status, { siteId })
  ).last?.steps.find((one) => one.source === "librenms");
  if (!step) throw new Error("expected a LibreNMS step");
  return step;
};

/** The minute cron, and the cycle it starts when one is due. */
const tick = async (admin: TestClient) => {
  await admin.mutation(internal.collection.startDue, {});
  await admin.finishAllScheduledFunctions(() => {});
};

const statusOf = async (admin: TestClient, deviceId: string) =>
  await admin.run(
    async (ctx) =>
      (
        await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
          .unique()
      )?.metadata.status ?? null,
  );

const sightings = async (admin: TestClient) =>
  await admin.run(async (ctx) =>
    (await ctx.db.query("macSightings").collect())
      .map(({ mac, portId, socketId, misses }) => ({
        mac,
        portId,
        socketId,
        misses,
      }))
      .sort((a, b) => a.mac.localeCompare(b.mac)),
  );

const uplinkMacs = [10, 11, 12, 13, 14].map((n) => ({
  port_id: 103,
  mac_address: macOf(n).replaceAll(":", ""),
}));

describe("the LibreNMS step", () => {
  it("brings devices online where they are seen, then offline after two cycles without", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [
      { port_id: 101, mac_address: PC.replaceAll(":", "") },
      { port_id: 101, mac_address: STRANGER.replaceAll(":", "") },
      { port_id: "102", mac_address: PRINTER.toUpperCase() },
      ...uplinkMacs,
    ];
    expect(await cycle(admin, siteId)).toEqual({
      source: "librenms",
      ok: true,
      message: expect.stringContaining(
        "1 switch lu, 3 MAC vues (2 passés en ligne, 1 inconnue).",
      ),
    });
    expect(librenms.state.discoveries).toBe(1);
    expect(await statusOf(admin, "device:pc")).toBe("up");
    expect(await statusOf(admin, "device:printer")).toBe("up");
    expect(await sightings(admin)).toEqual([
      {
        mac: PC,
        portId: "port:device:sw:interface:1",
        socketId: "device:socket",
        misses: 0,
      },
      {
        mac: PRINTER,
        portId: "port:device:sw:interface:2",
        socketId: undefined,
        misses: 0,
      },
      {
        mac: STRANGER,
        portId: "port:device:sw:interface:1",
        socketId: "device:socket",
        misses: 0,
      },
    ]);

    // One cycle without the pc keeps it online; the second takes it offline
    // and forgets the stranger. LibreNMS rediscovers at most every 5 minutes,
    // and keeps the pc's entry from a discovery long past.
    librenms.state.fdb = [
      { port_id: 102, mac_address: PRINTER },
      { port_id: 101, mac_address: PC, updated_at: "2026-10-16 05:00:00" },
    ];
    expect((await cycle(admin, siteId)).message).toContain("1 MAC vue.");
    expect(await statusOf(admin, "device:pc")).toBe("up");
    expect((await cycle(admin, siteId)).message).toContain(
      "1 MAC vue (1 passé hors ligne).",
    );
    expect(librenms.state.discoveries).toBe(1);
    expect(await statusOf(admin, "device:pc")).toBe("down");
    expect(
      (await sightings(admin)).map(({ mac, misses }) => [mac, misses]),
    ).toEqual([
      [PC, 2],
      [PRINTER, 0],
    ]);

    // A switch LibreNMS cannot read takes nobody offline.
    librenms.state.fdbStatus = 403;
    const failed = await cycle(admin, siteId);
    expect(failed.ok).toBe(false);
    expect(failed.message).toContain(
      "« pile » : LibreNMS refuse ce jeton (403).",
    );
    expect(await statusOf(admin, "device:printer")).toBe("up");

    // Without LibreNMS nothing would keep the statuses true.
    await admin.mutation(api.integrations.remove, { siteId, kind: "librenms" });
    expect(await statusOf(admin, "device:printer")).toBeNull();
    expect(await statusOf(admin, "device:pc")).toBeNull();
    expect(await sightings(admin)).toEqual([]);
  });

  it("gives a switch the status LibreNMS has for it", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    expect(await statusOf(admin, "device:sw")).toBeNull();
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:sw")).toBe("up");
    librenms.state.deviceStatus = 0;
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:sw")).toBe("down");
    // The core is not polled, so nothing says how it is.
    expect(await statusOf(admin, "device:core")).toBeNull();
  });

  it("forgets the statuses a switch read long ago set, until it is read again", async () => {
    setSystemTime(new Date("2026-10-16T08:00:00Z"));
    const { admin, siteId, signIn } = await siteWithLibreNMS();
    librenms.state.fdb = [{ port_id: 101, mac_address: PC }];
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:pc")).toBe("up");
    expect(await statusOf(admin, "device:sw")).toBe("up");

    // A switch no longer polled is not read, so the pc counts no miss.
    await admin.mutation(api.librenms.saveSettings, {
      siteId,
      baseUrl: LIBRENMS,
      settings: { switches: [{ switchId: "device:sw", device: null }] },
    });
    const calls = fetchStub.calls.length;
    expect((await cycle(admin, siteId)).message).toContain(
      "Aucun switch n'est interrogé.",
    );
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:pc")).toBe("up");
    // Only the connection checks.
    expect(
      fetchStub.calls
        .slice(calls)
        .every(([url]) => String(url).includes("/api/v0/system")),
    ).toBe(true);

    // Two hours of the site's longest interval, and the lease, vouch for
    // the read; the minute cron removes what rests on it afterwards.
    setSystemTime(new Date("2026-10-16T10:15:00Z"));
    await tick(admin);
    expect(await statusOf(admin, "device:pc")).toBe("up");
    setSystemTime(new Date("2026-10-16T10:16:00Z"));
    await tick(admin);
    expect(await statusOf(admin, "device:pc")).toBeNull();
    expect(await statusOf(admin, "device:sw")).toBeNull();

    // A cycle that reads no switch brings nothing back; one that reads it
    // does.
    const later = await signIn();
    await cycle(later, siteId);
    expect(await statusOf(later, "device:pc")).toBeNull();
    await later.mutation(api.librenms.saveSettings, {
      siteId,
      baseUrl: LIBRENMS,
      settings: {
        switches: [
          { switchId: "device:sw", device: { id: STACK, name: "pile" } },
        ],
      },
    });
    await cycle(later, siteId);
    expect(await statusOf(later, "device:pc")).toBe("up");
    expect(await statusOf(later, "device:sw")).toBe("up");
  });

  it("forgets the statuses a failing LibreNMS can no longer vouch for", async () => {
    setSystemTime(new Date("2026-10-16T08:00:00Z"));
    const { admin, siteId, signIn } = await siteWithLibreNMS();
    librenms.state.fdb = [{ port_id: 101, mac_address: PC }];
    await cycle(admin, siteId);
    librenms.state.fdbStatus = 403;
    setSystemTime(new Date("2026-10-16T09:00:00Z"));
    expect((await cycle(await signIn(), siteId)).ok).toBe(false);
    expect(await statusOf(admin, "device:pc")).toBe("up");
    setSystemTime(new Date("2026-10-16T10:16:00Z"));
    await tick(admin);
    expect(await statusOf(admin, "device:pc")).toBeNull();
    expect(await statusOf(admin, "device:sw")).toBeNull();
  });

  it("brings a device back with the status its read still vouches for", async () => {
    setSystemTime(new Date("2026-10-16T08:00:00Z"));
    const { admin, siteId, signIn } = await siteWithLibreNMS();
    librenms.state.fdb = [
      { port_id: 101, mac_address: PC },
      { port_id: 101, mac_address: PRINTER },
      { port_id: 101, mac_address: STRANGER },
    ];
    await cycle(admin, siteId);
    const removed = async (client: TestClient, deviceId: string) => {
      const payload = await client.mutation(api.devices.remove, { deviceId });
      if (!payload) throw new Error(`expected ${deviceId} to be removed`);
      return payload;
    };

    // An "Annuler" right away: the read still vouches for it.
    const printer = await removed(admin, "device:printer");
    expect(printer.metadata).toEqual({ status: "up" });
    await admin.mutation(api.devices.create, {
      siteId,
      deviceId: "device:printer",
      ...printer,
    });
    expect(await statusOf(admin, "device:printer")).toBe("up");

    const pc = await removed(admin, "device:pc");
    const late = await removed(admin, "device:printer");
    await admin.mutation(api.librenms.saveSettings, {
      siteId,
      baseUrl: LIBRENMS,
      settings: { switches: [{ switchId: "device:sw", device: null }] },
    });
    setSystemTime(new Date("2026-10-16T10:16:00Z"));
    const later = await signIn();
    await tick(later);

    // The cycle no longer looks at the expired read, so nothing would
    // remove a status brought back from before.
    await later.mutation(api.devices.create, {
      siteId,
      deviceId: "device:printer",
      ...late,
    });
    expect(await statusOf(later, "device:printer")).toBeNull();
    const buildingId = await later.mutation(api.buildings.create, {
      siteId,
      objectId: "building:back",
      name: "Bâtiment",
    });
    const floorId = await later.mutation(api.floors.create, {
      objectId: "floor:back",
      buildingId,
      name: "RDC",
    });
    const restored = await later.mutation(api.mapOperations.apply, {
      operation: {
        kind: "device.create",
        meta: {
          opId: "op:back",
          clientId: "client:back",
          clientSeq: 1,
          createdAt: Date.now(),
        },
        device: {
          id: "device:pc",
          floorId,
          type: "pc",
          name: "pc",
          position: { x: 0, y: 0 },
          size: { width: 80, height: 80 },
          macs: pc.identity.macs,
          metadata: pc.metadata,
        },
      },
    });
    expect(restored.status).toBe("applied");
    expect(await statusOf(later, "device:pc")).toBeNull();
    await later.mutation(api.unknownMacs.createDevice, {
      siteId,
      mac: STRANGER,
      deviceId: "device:stranger",
      name: "Inconnu",
    });
    expect(await statusOf(later, "device:stranger")).toBeNull();
  });

  it("forgets the sightings with the site", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [{ port_id: 101, mac_address: STRANGER }];
    await cycle(admin, siteId);
    expect(await sightings(admin)).toHaveLength(1);
    await admin.mutation(api.unknownMacs.ignore, { siteId, mac: STRANGER });
    await admin.mutation(api.sites.remove, { siteId });
    expect(await sightings(admin)).toEqual([]);
    expect(
      await admin.run(
        async (ctx) => await ctx.db.query("ignoredMacs").collect(),
      ),
    ).toEqual([]);
  });

  it("settles a device that dropped its MAC, and forgets one deleted", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [
      { port_id: 101, mac_address: PC },
      { port_id: 102, mac_address: PRINTER },
    ];
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:pc")).toBe("up");

    // Its new MAC was never seen: the network says nothing of this pc.
    await admin.mutation(api.devices.updateIdentity, {
      deviceId: "device:pc",
      edit: { macs: [macOf(9)] },
    });
    expect((await cycle(admin, siteId)).message).toContain(
      "2 MAC vues (1 inconnue).",
    );
    expect(await statusOf(admin, "device:pc")).toBeNull();

    // Once offline, a deleted device's MAC is an unknown one to forget.
    librenms.state.fdb = [];
    await cycle(admin, siteId);
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:printer")).toBe("down");
    await admin.mutation(api.devices.remove, { deviceId: "device:printer" });
    await cycle(admin, siteId);
    expect(await sightings(admin)).toEqual([]);
  });

  it("asks once for a discovery and reports when it could not", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [{ port_id: 101, mac_address: PC }];
    librenms.state.discoverStatus = 503;
    const uncertain = await cycle(admin, siteId);
    expect(
      fetchStub.calls.filter(([url]) => String(url).endsWith("/discover")),
    ).toHaveLength(1);
    expect(uncertain.ok).toBe(false);
    expect(uncertain.message).toContain(
      "« pile » n'a pas pu lancer sa découverte : LibreNMS a répondu 503.",
    );
    // It ran anyway, so the tables are read.
    expect(await statusOf(admin, "device:pc")).toBe("up");

    // Five minutes later.
    await admin.run(async (ctx) => {
      const row = await ctx.db.query("siteCycles").first();
      if (row) await ctx.db.patch(row._id, { librenmsDiscoveryAt: 0 });
    });
    librenms.state.discoverStatus = 403;
    const refused = await cycle(admin, siteId);
    expect(refused.message).toContain(
      "« pile » n'a pas pu lancer sa découverte : LibreNMS refuse ce jeton (403).",
    );
    expect(librenms.state.discoveries).toBe(1);
  });

  it("sees nothing in a table a discovery did not refresh", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [
      { port_id: 101, mac_address: PC, updated_at: "2026-10-16 06:00:00" },
    ];
    const discoverAgain = async () =>
      await admin.run(async (ctx) => {
        const row = await ctx.db.query("siteCycles").first();
        if (row) await ctx.db.patch(row._id, { librenmsDiscoveryAt: 0 });
      });
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:pc")).toBe("up");

    await discoverAgain();
    expect((await cycle(admin, siteId)).message).toContain(
      "« pile » : sa dernière découverte n'a rafraîchi aucune entrée.",
    );
    expect(await statusOf(admin, "device:pc")).toBe("up");
    // The next cycle, too soon to rediscover, still trusts none of them.
    expect((await cycle(admin, siteId)).message).toContain(
      "0 MAC vue (1 passé hors ligne).",
    );
    expect(librenms.state.discoveries).toBe(2);
    expect(await statusOf(admin, "device:pc")).toBe("down");
  });

  it("places a device next to the socket it is seen at, and keeps where a person put it", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    const buildingId = await admin.mutation(api.buildings.create, {
      siteId,
      objectId: "building:cycle",
      name: "Bâtiment",
    });
    const floorId = await admin.mutation(api.floors.create, {
      objectId: "floor:cycle",
      buildingId,
      name: "RDC",
    });
    await admin.mutation(api.devices.create, {
      siteId,
      deviceId: "device:socket-2",
      type: "wall-port",
      identity: { name: "socket-2", macs: [] },
      cables: [
        {
          id: "cable:desk-2",
          a: { deviceId: "device:sw", portId: "port:device:sw:interface:2" },
          b: {
            deviceId: "device:socket-2",
            portId: "port:device:socket-2:front:1",
          },
        },
      ],
    });
    const socketAt = { x: 400, y: 400 };
    const socketSize = { width: 40, height: 40 };
    const upstairs = await admin.mutation(api.floors.create, {
      objectId: "floor:cycle-2",
      buildingId,
      name: "Étage",
    });
    const setPlacement = async (
      deviceId: string,
      position: { x: number; y: number },
      size: { width: number; height: number },
      on = floorId,
    ) =>
      await admin.run(async (ctx) => {
        const row = await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
          .unique();
        if (row) {
          await ctx.db.patch(row._id, {
            placement: { floorId: on, position, size },
          });
        }
      });
    await setPlacement("device:socket", socketAt, socketSize);
    await setPlacement(
      "device:socket-2",
      { x: 2000, y: 400 },
      socketSize,
      upstairs,
    );
    const placementOf = async (deviceId: string) =>
      await admin.run(
        async (ctx) =>
          (
            await ctx.db
              .query("devices")
              .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
              .unique()
          )?.placement ?? null,
      );
    const distance = (
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => Math.hypot(a.x - b.x, a.y - b.y);

    // Seen while on no floor: placed beside its socket, clear of it.
    librenms.state.fdb = [{ port_id: 101, mac_address: PC }];
    expect((await cycle(admin, siteId)).message).toContain(
      "1 MAC vue (1 passé en ligne, 1 placé près de sa prise).",
    );
    const placed = await placementOf("device:pc");
    expect(placed).toMatchObject({
      floorId,
      size: { width: 80, height: 80 },
    });
    if (!placed) throw new Error("expected the pc on the floor");
    expect(distance(placed.position, socketAt)).toBeLessThan(150);
    const { x, y } = placed.position;
    expect(
      x + 80 <= socketAt.x ||
        x >= socketAt.x + 40 ||
        y + 80 <= socketAt.y ||
        y >= socketAt.y + 40,
    ).toBe(true);
    expect(
      await admin.query(api.mapDocument.getFloorRevision, { floorId }),
    ).toBeGreaterThan(0);

    // A person moves it: the same socket keeps it there.
    await setPlacement("device:pc", { x: 1000, y: 1000 }, placed.size);
    await cycle(admin, siteId);
    expect((await placementOf("device:pc"))?.position).toEqual({
      x: 1000,
      y: 1000,
    });

    // Seen at a socket upstairs: it follows, through the map's operations.
    librenms.state.fdb = [{ port_id: 102, mac_address: PC }];
    expect((await cycle(admin, siteId)).message).toContain(
      "1 placé près de sa prise",
    );
    const moved = await placementOf("device:pc");
    if (!moved) throw new Error("expected the pc on the floor");
    expect(moved.floorId).toBe(upstairs);
    expect(distance(moved.position, { x: 2000, y: 400 })).toBeLessThan(150);
    expect(
      await admin.run(async (ctx) =>
        (await ctx.db.query("clientOperations").collect()).map(
          ({ kind, clientId, status }) => [kind, clientId, status],
        ),
      ),
    ).toEqual([
      ["device.place", "librenms", "applied"],
      ["device.unplace", "librenms", "applied"],
      ["device.place", "librenms", "applied"],
    ]);
  });

  it("lists unknown MACs and makes an endpoint of one, next to its socket", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    const buildingId = await admin.mutation(api.buildings.create, {
      siteId,
      objectId: "building:cycle",
      name: "Bâtiment",
    });
    const floorId = await admin.mutation(api.floors.create, {
      objectId: "floor:cycle",
      buildingId,
      name: "RDC",
    });
    await admin.run(async (ctx) => {
      const socket = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", "device:socket"))
        .unique();
      if (socket) {
        await ctx.db.patch(socket._id, {
          placement: {
            floorId,
            position: { x: 400, y: 400 },
            size: { width: 40, height: 40 },
          },
        });
      }
    });
    const LOOSE = macOf(4);
    librenms.state.fdb = [
      { port_id: 101, mac_address: STRANGER },
      // Port 2 is cabled to nothing.
      { port_id: 102, mac_address: LOOSE },
    ];
    expect((await cycle(admin, siteId)).message).toContain("2 inconnues");

    const unknown = await admin.query(api.unknownMacs.listForSite, { siteId });
    expect(unknown).toHaveLength(2);
    expect(unknown.find(({ mac }) => mac === STRANGER)).toMatchObject({
      switchName: "sw",
      portName: "GigabitEthernet1/0/1",
      socket: { id: "device:socket", name: "socket", placed: true },
    });
    expect(unknown.find(({ mac }) => mac === LOOSE)?.socket).toBeNull();

    expect(
      await admin.mutation(api.unknownMacs.createDevice, {
        siteId,
        mac: STRANGER,
        deviceId: "device:stranger",
        name: "  Imprimante  ",
      }),
    ).toEqual({ placed: true });
    const created = await admin.run(
      async (ctx) =>
        await ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) => q.eq("objectId", "device:stranger"))
          .unique(),
    );
    expect(created).toMatchObject({
      type: "endpoint",
      name: "Imprimante",
      macs: [STRANGER],
      metadata: { status: "up" },
      placement: { floorId },
    });
    const position = created?.placement?.position;
    if (!position) throw new Error("expected the endpoint on the floor");
    expect(Math.hypot(position.x - 400, position.y - 400)).toBeLessThan(150);
    expect(
      await admin.run(async (ctx) =>
        (await ctx.db.query("clientOperations").collect()).map(
          ({ kind, status }) => [kind, status],
        ),
      ),
    ).toEqual([["device.place", "applied"]]);
    expect(
      (await admin.query(api.unknownMacs.listForSite, { siteId })).map(
        ({ mac }) => mac,
      ),
    ).toEqual([LOOSE]);

    // Already carried now.
    await expect(
      admin.mutation(api.unknownMacs.createDevice, {
        siteId,
        mac: STRANGER,
        deviceId: "device:again",
        name: "Encore",
      }),
    ).rejects.toThrow("déjà celle de Imprimante");
    // Seen at no socket: created on no floor.
    expect(
      await admin.mutation(api.unknownMacs.createDevice, {
        siteId,
        mac: LOOSE,
        deviceId: "device:loose",
        name: "Portable",
      }),
    ).toEqual({ placed: false });

    const next = (await cycle(admin, siteId)).message;
    expect(next).toContain("2 MAC vues.");
  });

  it("ignores an unknown MAC for good, and restores it", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    const LOOSE = macOf(4);
    librenms.state.fdb = [
      { port_id: 101, mac_address: STRANGER },
      { port_id: 102, mac_address: LOOSE },
    ];
    await cycle(admin, siteId);
    const unknown = async () =>
      (await admin.query(api.unknownMacs.listForSite, { siteId })).map(
        ({ mac }) => mac,
      );
    const ignored = async () =>
      (await admin.query(api.unknownMacs.listIgnored, { siteId })).map(
        ({ mac }) => mac,
      );

    // Any notation names the same MAC, and ignoring twice changes nothing.
    await admin.mutation(api.unknownMacs.ignore, {
      siteId,
      mac: STRANGER.toUpperCase().replaceAll(":", "-"),
    });
    await admin.mutation(api.unknownMacs.ignore, { siteId, mac: STRANGER });
    expect(await unknown()).toEqual([LOOSE]);
    expect(await ignored()).toEqual([STRANGER]);
    expect((await cycle(admin, siteId)).message).toContain("1 inconnue");

    // It outlives its sighting.
    librenms.state.fdb = [];
    await cycle(admin, siteId);
    await cycle(admin, siteId);
    expect(await sightings(admin)).toEqual([]);
    librenms.state.fdb = [{ port_id: 101, mac_address: STRANGER }];
    await cycle(admin, siteId);
    expect(await unknown()).toEqual([]);
    expect(await ignored()).toEqual([STRANGER]);

    await admin.mutation(api.unknownMacs.restore, { siteId, mac: STRANGER });
    await admin.mutation(api.unknownMacs.restore, { siteId, mac: STRANGER });
    expect(await ignored()).toEqual([]);
    expect(await unknown()).toEqual([STRANGER]);

    await expect(
      admin.mutation(api.unknownMacs.ignore, { siteId, mac: PC }),
    ).rejects.toThrow("est celle de pc");
    await expect(
      admin.mutation(api.unknownMacs.ignore, { siteId, mac: "pas une MAC" }),
    ).rejects.toThrow("illisible");
    await expect(
      admin.mutation(api.unknownMacs.ignore, {
        siteId: "site:gone",
        mac: LOOSE,
      }),
    ).rejects.toThrow("n'existe plus");

    // A device that gains an ignored MAC takes it out of both lists.
    await admin.mutation(api.unknownMacs.ignore, { siteId, mac: STRANGER });
    await admin.mutation(api.devices.create, {
      siteId,
      deviceId: "device:phone",
      type: "endpoint",
      identity: { name: "Téléphone", macs: [STRANGER] },
    });
    expect(await ignored()).toEqual([]);
    expect(await unknown()).toEqual([]);
  });

  it("records nothing once LibreNMS was removed during the read", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    await admin.mutation(api.collection.refresh, { siteId });
    const cycleId = await admin.run(
      async (ctx) =>
        (await ctx.db.query("siteCycles").first())?.running?.cycleId,
    );
    if (!cycleId) throw new Error("expected a running cycle");
    await admin.mutation(api.integrations.remove, { siteId, kind: "librenms" });
    expect(
      await admin.mutation(internal.librenmsCycle.recordSightings, {
        siteId,
        cycleId,
        baseUrl: LIBRENMS,
        readSwitches: [{ switchId: "device:sw", status: "up" }],
        sightings: [
          {
            mac: PC,
            portId: "port:device:sw:interface:2",
            switchId: "device:sw",
          },
        ],
        tables: [],
      }),
    ).toBeNull();
    expect(await sightings(admin)).toEqual([]);
    expect(await statusOf(admin, "device:pc")).toBeNull();
    expect(await statusOf(admin, "device:sw")).toBeNull();
  });
});
