import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { api, internal } from "./_generated/api";
import { createTestSite, signedInTest } from "./_test/auth.setup";
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
        devices: [{ device_id: STACK, last_discovered: state.lastDiscovered }],
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
  const admin = await signedInTest("admin");
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
  return { admin, siteId };
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

  it("reads nothing and takes everyone offline once no switch is polled", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [{ port_id: 101, mac_address: PC }];
    await cycle(admin, siteId);
    expect(await statusOf(admin, "device:pc")).toBe("up");

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
    expect(await statusOf(admin, "device:pc")).toBe("down");
    // Only the connection checks.
    expect(
      fetchStub.calls
        .slice(calls)
        .every(([url]) => String(url).includes("/api/v0/system")),
    ).toBe(true);
  });

  it("forgets the sightings with the site", async () => {
    const { admin, siteId } = await siteWithLibreNMS();
    librenms.state.fdb = [{ port_id: 101, mac_address: STRANGER }];
    await cycle(admin, siteId);
    expect(await sightings(admin)).toHaveLength(1);
    await admin.mutation(api.sites.remove, { siteId });
    expect(await sightings(admin)).toEqual([]);
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
      "« pile » : la découverte n'a rafraîchi aucune entrée.",
    );
    expect(await statusOf(admin, "device:pc")).toBe("up");
    await discoverAgain();
    expect((await cycle(admin, siteId)).message).toContain(
      "0 MAC vue (1 passé hors ligne).",
    );
    expect(librenms.state.discoveries).toBe(3);
    expect(await statusOf(admin, "device:pc")).toBe("down");
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
        failedSwitchIds: [],
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
  });
});
