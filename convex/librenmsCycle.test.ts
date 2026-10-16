import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { api } from "./_generated/api";
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

/** A LibreNMS polling one device, whose forwarding table a test sets. */
function fakeLibreNMS() {
  const state = {
    fdb: [] as Array<{ port_id: number | string; mac_address: string }>,
    fdbStatus: 200,
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
      state.discoveries += 1;
      state.lastDiscovered = `2026-10-16 07:0${state.discoveries}:00`;
      return Response.json({ status: "ok", result: { status: 0 } });
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
        ? Response.json({ status: "ok", ports_fdb: state.fdb })
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
    // and forgets the stranger. LibreNMS rediscovers at most every 5 minutes.
    librenms.state.fdb = [{ port_id: 102, mac_address: PRINTER }];
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
});
