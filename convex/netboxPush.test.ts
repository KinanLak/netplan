import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import {
  createSignedInUser,
  createTestSite,
  testBackend,
} from "./_test/auth.setup";
import type { TestClient } from "./_test/auth.setup";

const TOKEN = "a-token-for-tests"; // gitleaks:allow
const NETBOX = "https://netbox.test";
const MAC = "02:00:00:00:00:0a";
const NOW = Date.now();

// The test DOM installs `fetch` as an accessor, which `spyOn` cannot wrap.
const realFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (realFetch) Object.defineProperty(globalThis, "fetch", realFetch);
  delete process.env.NETPLAN_SECRET_KEY;
});

type Patch = { url: string; fields: Record<string, unknown> };

/** A NetBox that answers each PATCH with `status`, and records it. */
const netboxAnswering = (
  status: (url: string) => number | Error | Promise<number>,
) => {
  const patches: Array<Patch> = [];
  const answer = async (url: string | URL | Request, init?: RequestInit) => {
    const { pathname } = new URL(String(url));
    if (init?.method !== "PATCH") {
      return Response.json({ "netbox-version": "4.6.10" });
    }
    const body = JSON.parse(String(init.body)) as {
      custom_fields: Record<string, unknown>;
    };
    patches.push({ url: pathname, fields: body.custom_fields });
    const outcome = await status(pathname);
    if (outcome instanceof Error) throw outcome;
    return outcome === 400
      ? Response.json(
          { custom_fields: ["Unknown field name 'netplan_site'."] },
          { status: 400 },
        )
      : Response.json({}, { status: outcome });
  };
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: answer,
  });
  return patches;
};

/**
 * A site with a NetBox, a socket on a floor behind a switch port, and two
 * NetBox computers: `device:seen` seen at the socket, `device:unseen` never
 * seen; and a manual computer seen too, which NetBox does not know.
 */
async function pushingSite() {
  netboxAnswering(() => 200);
  const t = testBackend();
  const admin = t.withIdentity((await createSignedInUser(t, "admin")).identity);
  const siteId = await createTestSite(admin, { name: "Siège" });
  await admin.action(api.sources.saveIntegration, {
    siteId,
    kind: "netbox",
    baseUrl: NETBOX,
    enabled: true,
    ignoreCertificateErrors: false,
    token: TOKEN,
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("buildings", {
      objectId: "building:a",
      siteId,
      name: "Bâtiment A",
      order: 0,
    });
    await ctx.db.insert("floors", {
      objectId: "floor:rdc",
      buildingId: "building:a",
      name: "RDC",
      order: 0,
    });
    const device = (
      objectId: string,
      type: "pc" | "switch" | "wall-port",
      more: Record<string, unknown> = {},
    ) =>
      ctx.db.insert("devices", {
        objectId,
        siteId,
        type,
        name: objectId.replace("device:", ""),
        macs: [],
        metadata: {},
        updatedAt: NOW,
        updatedBy: "test",
        ...more,
      });
    await device("device:sw", "switch");
    for (const [objectId, name] of [
      ["port:sw:1", "Gi1/0/1"],
      ["port:sw:2", "Gi1/0/2"],
    ]) {
      await ctx.db.insert("ports", {
        objectId,
        siteId,
        deviceId: "device:sw",
        name,
        kind: "interface",
        order: 0,
      });
    }
    for (const objectId of ["device:B-01", "device:B-02"]) {
      await device(objectId, "wall-port", {
        placement: {
          floorId: "floor:rdc",
          position: { x: 0, y: 0 },
          size: { width: 20, height: 20 },
        },
      });
    }
    const fromNetBox = (externalId: string) => ({
      source: { integration: "netbox", externalId, syncedAt: NOW },
    });
    await device("device:seen", "pc", {
      macs: [MAC],
      metadata: { status: "up" },
      ...fromNetBox("41"),
    });
    await device("device:unseen", "pc", {
      macs: ["02:00:00:00:00:0b"],
      ...fromNetBox("42"),
    });
    await device("device:manual", "pc", { macs: ["02:00:00:00:00:0c"] });
    for (const mac of [MAC, "02:00:00:00:00:0c"]) {
      await ctx.db.insert("macSightings", {
        siteId,
        mac,
        switchId: "device:sw",
        portId: "port:sw:1",
        socketId: "device:B-01",
        seenAt: NOW,
        misses: 0,
      });
    }
    await ctx.db.insert("siteCycles", { siteId, nextRunAt: NOW, failures: 0 });
  });
  return { t, admin, siteId };
}

const turnOn = async (admin: TestClient, siteId: string) => {
  await admin.mutation(api.netbox.saveSettings, {
    siteId,
    baseUrl: NETBOX,
    settings: {
      site: { id: 1, name: "Siège" },
      roles: [{ id: 1, name: "PC", type: "pc" }],
    },
  });
  await admin.mutation(api.netbox.setPush, { siteId, push: true });
};

const push = async (admin: TestClient, siteId: string) =>
  await admin.action(internal.sources.pushToNetBox, { siteId });

const lastPush = async (admin: TestClient, siteId: string) =>
  await admin.run(async (ctx) => {
    const cycle = await ctx.db
      .query("siteCycles")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .unique();
    return cycle?.lastPush ?? null;
  });

const moveTo = async (
  admin: TestClient,
  siteId: string,
  sighting: { portId: string; socketId: string; seenAt: number },
) =>
  await admin.run(async (ctx) => {
    const row = await ctx.db
      .query("macSightings")
      .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", MAC))
      .unique();
    if (row) await ctx.db.patch(row._id, sighting);
  });

const pushHealth = async (admin: TestClient, siteId: string) => {
  const sites = await admin.query(api.health.overview, {});
  return sites.find((site) => site.id === siteId)?.netbox?.push;
};

const failing = async (admin: TestClient, siteId: string) =>
  (await pushHealth(admin, siteId))?.failing;

/** Runs `work` with the retry pauses passing at once: tests wait on nothing. */
const withoutPauses = async (work: () => Promise<unknown>) => {
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void) => {
    callback();
    return 0;
  }) as unknown as typeof setTimeout;
  try {
    await work();
  } finally {
    globalThis.setTimeout = realTimeout;
  }
};

const patchDevice = async (
  admin: TestClient,
  objectId: string,
  fields: Record<string, unknown>,
) =>
  await admin.run(async (ctx) => {
    const row = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
      .unique();
    if (row) await ctx.db.patch(row._id, fields);
  });

const retryNow = async (admin: TestClient, deviceId: string) =>
  await admin.run(async (ctx) => {
    const row = await ctx.db
      .query("netboxPushes")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .unique();
    if (row) await ctx.db.patch(row._id, { retryAt: Date.now() - 1 });
  });

describe("the push to NetBox", () => {
  it("sends nothing while it is off", async () => {
    const { admin, siteId } = await pushingSite();
    const patches = netboxAnswering(() => 200);
    await push(admin, siteId);
    expect(patches).toEqual([]);
    expect(await lastPush(admin, siteId)).toBeNull();
  });

  it("cannot be turned on before a NetBox site and role are chosen", async () => {
    const { admin, siteId } = await pushingSite();
    const error: unknown = await admin
      .mutation(api.netbox.setPush, { siteId, push: true })
      .catch((failure: unknown) => failure);
    expect(error instanceof ConvexError ? error.data : error).toBe(
      "Choisissez d'abord le site NetBox et au moins un rôle à importer.",
    );
    expect(await admin.query(api.netbox.importedCount, { siteId })).toBe(2);
  });

  it("writes where each NetBox device was seen, once", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    const patches = netboxAnswering(() => 200);
    await push(admin, siteId);
    expect(patches).toEqual([
      {
        url: "/api/dcim/devices/41/",
        fields: {
          netplan_site: "Siège",
          netplan_floor: "Bâtiment A · RDC",
          netplan_socket: "B-01",
          netplan_switch_port: "sw · Gi1/0/1",
          netplan_last_seen: new Date(NOW)
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z"),
        },
      },
    ]);
    expect(await lastPush(admin, siteId)).toMatchObject({
      sent: 1,
      refused: 0,
    });

    // Seen again at the same socket a cycle later: NetBox already shows it.
    await moveTo(admin, siteId, {
      portId: "port:sw:1",
      socketId: "device:B-01",
      seenAt: NOW + 5 * 60_000,
    });
    await push(admin, siteId);
    expect(patches).toHaveLength(1);
  });

  it("writes a move at once, and an offline device's last sighting", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    const patches = netboxAnswering(() => 200);
    await push(admin, siteId);

    await moveTo(admin, siteId, {
      portId: "port:sw:2",
      socketId: "device:B-02",
      seenAt: NOW + 5 * 60_000,
    });
    await push(admin, siteId);
    expect(patches.at(-1)?.fields).toMatchObject({
      netplan_socket: "B-02",
      netplan_switch_port: "sw · Gi1/0/2",
    });

    await moveTo(admin, siteId, {
      portId: "port:sw:2",
      socketId: "device:B-02",
      seenAt: NOW + 10 * 60_000,
    });
    await admin.run(async (ctx) => {
      const row = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", "device:seen"))
        .unique();
      if (row) await ctx.db.patch(row._id, { metadata: { status: "down" } });
    });
    await push(admin, siteId);
    expect(patches).toHaveLength(3);
    expect(patches.at(-1)?.fields.netplan_last_seen).toBe(
      new Date(NOW + 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    );
  });

  it("shows a refused device on the health page until NetBox takes it", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    const patches = netboxAnswering(() => 400);
    await push(admin, siteId);
    expect(await lastPush(admin, siteId)).toMatchObject({
      sent: 0,
      refused: 1,
    });
    expect(await failing(admin, siteId)).toEqual([
      expect.objectContaining({
        deviceName: "seen",
        message:
          "NetBox refuse ces valeurs (400). Unknown field name 'netplan_site'.",
        failures: 1,
      }),
    ]);

    // It waits a minute before the next try.
    await push(admin, siteId);
    expect(patches).toHaveLength(1);

    await retryNow(admin, "device:seen");
    netboxAnswering(() => 200);
    await push(admin, siteId);
    expect(await failing(admin, siteId)).toEqual([]);
  });

  it("stops at an unreachable NetBox and says so", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    netboxAnswering(() => new TypeError("fetch failed"));
    await withoutPauses(() => push(admin, siteId));
    expect(await lastPush(admin, siteId)).toMatchObject({
      sent: 0,
      refused: 0,
      error: "NetBox est injoignable à cette adresse.",
    });
    expect(await failing(admin, siteId)).toEqual([]);
  });

  it("follows each cycle while it is on, and forgets what it sent with the NetBox", async () => {
    const { t, admin, siteId } = await pushingSite();
    const editor = t.withIdentity(
      (await createSignedInUser(t, "editor")).identity,
    );
    await turnOn(admin, siteId);
    // A NetBox site with no devices: the import keeps the inventory as it is.
    const patches = netboxAnswering(() => 200);
    await editor.mutation(api.collection.refresh, { siteId });
    await editor.finishAllScheduledFunctions(() => {});
    expect(patches.map((patch) => patch.url)).toEqual([
      "/api/dcim/devices/41/",
    ]);

    await admin.mutation(api.netbox.setPush, { siteId, push: false });
    await moveTo(admin, siteId, {
      portId: "port:sw:2",
      socketId: "device:B-02",
      seenAt: NOW + 5 * 60_000,
    });
    await push(admin, siteId);
    expect(patches).toHaveLength(1);

    await admin.mutation(api.integrations.remove, { siteId, kind: "netbox" });
    const rows = await admin.run(
      async (ctx) => await ctx.db.query("netboxPushes").collect(),
    );
    expect(rows).toEqual([]);
  });
  it("stops retrying a PATCH once the push is turned off", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    const patches = netboxAnswering(async () => {
      await admin.mutation(api.netbox.setPush, { siteId, push: false });
      return 503;
    });
    await withoutPauses(() => push(admin, siteId));
    expect(patches).toHaveLength(1);
  });

  it("drops an answer from the NetBox the site has just left", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    const patches = netboxAnswering(async () => {
      await admin.action(api.sources.saveIntegration, {
        siteId,
        kind: "netbox",
        baseUrl: "https://other-netbox.test",
        enabled: true,
        ignoreCertificateErrors: false,
        token: TOKEN,
      });
      return 200;
    });
    await push(admin, siteId);
    const rows = await admin.run(
      async (ctx) => await ctx.db.query("netboxPushes").collect(),
    );
    expect(patches).toHaveLength(1);
    expect(rows).toEqual([]);
    // The run lost its lease with the address: it reports nothing either.
    expect(await lastPush(admin, siteId)).toBeNull();
  });

  it("sends again to the NetBox device a computer is bound to now", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    await patchDevice(admin, "device:seen", { metadata: { status: "down" } });
    const patches = netboxAnswering(() => 200);
    await push(admin, siteId);

    // Imported again as another NetBox device, which first refuses.
    await patchDevice(admin, "device:seen", {
      source: { integration: "netbox", externalId: "43", syncedAt: NOW },
    });
    netboxAnswering(() => 400);
    await push(admin, siteId);
    await retryNow(admin, "device:seen");
    const again = netboxAnswering(() => 200);
    await push(admin, siteId);
    expect(patches.map((patch) => patch.url)).toEqual([
      "/api/dcim/devices/41/",
    ]);
    // The same values, but NetBox device 43 never had them.
    expect(again.map((patch) => patch.url)).toEqual(["/api/dcim/devices/43/"]);
    expect(await failing(admin, siteId)).toEqual([]);
    const row = await admin.run(
      async (ctx) =>
        await ctx.db
          .query("netboxPushes")
          .withIndex("by_device", (q) => q.eq("deviceId", "device:seen"))
          .unique(),
    );
    expect(row).toMatchObject({ netboxId: 43, failures: 0 });
  });

  it("lists the devices still failing past the rows of removed ones", async () => {
    const { admin, siteId } = await pushingSite();
    await turnOn(admin, siteId);
    netboxAnswering(() => 400);
    await push(admin, siteId);
    await admin.run(async (ctx) => {
      for (let n = 0; n < 25; n += 1) {
        await ctx.db.insert("netboxPushes", {
          siteId,
          deviceId: `device:gone-${n}`,
          netboxId: 100 + n,
          failures: 1,
          message: "NetBox refuse ces valeurs (400).",
          failingSince: NOW,
          retryAt: 1 + n,
        });
      }
    });
    expect(await pushHealth(admin, siteId)).toMatchObject({
      failing: [expect.objectContaining({ deviceName: "seen" })],
      more: false,
    });
  });
});
