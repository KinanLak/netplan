import { afterEach, beforeEach, describe, expect, it } from "bun:test";
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
const NETBOX = "https://netbox.test";
const MAC_A = "02:00:00:00:00:0a";
const MAC_B = "02:00:00:00:00:0b";

type Raw = Record<string, unknown>;

type Lists = {
  devices: Array<Raw>;
  interfaces?: Array<Raw>;
  frontPorts?: Array<Raw>;
  rearPorts?: Array<Raw>;
  cables?: Array<Raw>;
};

const LIST_OF: Partial<Record<string, keyof Lists>> = {
  "/api/dcim/devices/": "devices",
  "/api/dcim/interfaces/": "interfaces",
  "/api/dcim/front-ports/": "frontPorts",
  "/api/dcim/rear-ports/": "rearPorts",
  "/api/dcim/cables/": "cables",
};

/** A NetBox that serves these lists, one page each. */
const netboxServing = (lists: Lists) => {
  const reads: Array<string> = [];
  const answer = (url: string) => {
    const { pathname } = new URL(url);
    reads.push(pathname);
    if (pathname === "/api/status/") {
      return Response.json({ "netbox-version": "4.6.10" });
    }
    // Site 7 and roles 4 and 5 are this NetBox's, wherever it is reached;
    // `other-netbox.test` is another instance, without that site.
    if (pathname === "/api/dcim/sites/7/") {
      return new URL(url).host === "other-netbox.test"
        ? Response.json({ detail: "Not found." }, { status: 404 })
        : Response.json({ id: 7, name: "Siège" });
    }
    if (pathname === "/api/dcim/device-roles/") {
      const results = [{ id: 4 }, { id: 5 }];
      return Response.json({ count: results.length, results });
    }
    const name = LIST_OF[pathname];
    const results = (name && lists[name]) ?? [];
    return Response.json({ count: results.length, results });
  };
  return { answer, reads, lists };
};

const netbox = (devices: Array<Raw>, interfaces: Array<Raw>) =>
  netboxServing({ devices, interfaces });

const device = (id: number, name: string, more: Raw = {}): Raw => ({
  id,
  name,
  role: { id: 4 },
  device_type: { model: "OptiPlex" },
  display_url: `${NETBOX}/dcim/devices/${id}/`,
  ...more,
});

const iface = (deviceId: number, mac: string): Raw => ({
  device: { id: deviceId },
  mac_addresses: [{ mac_address: mac }],
});

let fetchStub: ReturnType<typeof stubFetch>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
});

/**
 * A site whose NetBox imports role 4 of NetBox site 7 as computers, and
 * role 5 as patch panels.
 */
async function importingSite(source: ReturnType<typeof netboxServing>) {
  fetchStub = stubFetch(source.answer);
  const t = testBackend();
  const editor = t.withIdentity(
    (await createSignedInUser(t, "editor")).identity,
  );
  const admin = t.withIdentity((await createSignedInUser(t, "admin")).identity);
  const siteId = await createTestSite(admin);
  await admin.action(api.sources.saveIntegration, {
    siteId,
    kind: "netbox",
    baseUrl: NETBOX,
    enabled: true,
    ignoreCertificateErrors: false,
    token: TOKEN,
  });
  await admin.mutation(api.netbox.saveSettings, {
    siteId,
    baseUrl: NETBOX,
    settings: {
      site: { id: 7, name: "Siège" },
      roles: [
        { id: 4, name: "Workstation", type: "pc" },
        { id: 5, name: "Patch panel", type: "patch-panel" },
      ],
    },
  });
  return { t, admin, editor, siteId };
}

const refresh = async (editor: TestClient, siteId: string) => {
  await editor.mutation(api.collection.refresh, { siteId });
  await editor.finishAllScheduledFunctions(() => {});
};

const lastSteps = async (admin: TestClient, siteId: string) =>
  (await admin.query(api.collection.status, { siteId })).last?.steps;

const inventory = async (editor: TestClient, siteId: string) =>
  (await editor.query(api.devices.listForSite, { siteId })).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  );

describe("NetBox import", () => {
  it("merges NetBox's devices into the inventory and creates the others", async () => {
    const source = netbox(
      [device(12, "pc-0012", { serial: "SN-12" }), device(13, "pc-0013")],
      [iface(12, MAC_A), iface(13, MAC_B)],
    );
    const { admin, editor, siteId } = await importingSite(source);
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "endpoint",
      identity: { name: "Poste accueil", macs: [MAC_A], notes: "Bureau 4" },
    });

    await refresh(editor, siteId);

    expect(await lastSteps(admin, siteId)).toEqual([
      {
        source: "netbox",
        ok: true,
        message: "Import : 2 équipements (1 nouveau, 1 rattaché).",
      },
    ]);
    const [merged, created] = await inventory(editor, siteId);
    expect(merged).toMatchObject({
      id: "device:manual",
      name: "pc-0012",
      type: "pc",
      serial: "SN-12",
      macs: [MAC_A],
      model: "OptiPlex",
      notes: "Bureau 4",
      source: { integration: "netbox", externalId: "12" },
    });
    expect(created).toMatchObject({
      name: "pc-0013",
      macs: [MAC_B],
      location: null,
      source: {
        integration: "netbox",
        externalId: "13",
        url: `${NETBOX}/dcim/devices/13/`,
      },
    });
    expect(source.reads).toContain("/api/dcim/interfaces/");
  });

  it("imports at most every 15 minutes outside a manual refresh, and marks absent what NetBox dropped", async () => {
    const devices = [device(12, "pc-0012"), device(13, "pc-0013")];
    const source = netbox(devices, []);
    const { t, admin, editor, siteId } = await importingSite(source);
    await refresh(editor, siteId);

    const runAutomatic = async () => {
      await t.run(async (ctx) => {
        const cycle = await ctx.db
          .query("siteCycles")
          .withIndex("by_site", (q) => q.eq("siteId", siteId))
          .unique();
        if (cycle) await ctx.db.patch(cycle._id, { nextRunAt: 0 });
      });
      expect(await t.mutation(internal.collection.startDue, {})).toBe(1);
      await t.finishAllScheduledFunctions(() => {});
    };

    devices.pop();
    source.reads.length = 0;
    await runAutomatic();
    expect(source.reads).toEqual(["/api/status/"]);
    expect(await inventory(editor, siteId)).toHaveLength(2);

    await t.run(async (ctx) => {
      const cycle = await ctx.db
        .query("siteCycles")
        .withIndex("by_site", (q) => q.eq("siteId", siteId))
        .unique();
      if (cycle) {
        await ctx.db.patch(cycle._id, {
          netboxImportedAt: Date.now() - 16 * 60_000,
        });
      }
    });
    await runAutomatic();
    expect(
      (await inventory(editor, siteId)).map((d) => [
        d.name,
        d.source?.missingSince !== undefined,
      ]),
    ).toEqual([
      ["pc-0012", false],
      ["pc-0013", true],
    ]);
    expect((await lastSteps(admin, siteId))?.[0]?.message).toContain(
      "(1 absent de NetBox)",
    );
  });

  it("waits for a person when only a hostname matches", async () => {
    const source = netbox([device(12, "PC-0012")], []);
    const { t, admin, editor, siteId } = await importingSite(source);
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "pc",
      identity: { name: "Accueil", hostname: "pc-0012.corp.test", macs: [] },
    });

    await refresh(editor, siteId);

    expect(await inventory(editor, siteId)).toHaveLength(1);
    const reviews = await t.run(
      async (ctx) => await ctx.db.query("importReviews").collect(),
    );
    expect(reviews).toMatchObject([
      {
        siteId,
        kind: "suggestion",
        device: { externalId: "12", name: "PC-0012" },
        candidateIds: ["device:manual"],
      },
    ]);

    await admin.mutation(api.sites.remove, { siteId });
    expect(
      await t.run(async (ctx) => await ctx.db.query("importReviews").collect()),
    ).toEqual([]);
  });

  it("marks absent what NetBox brought once no role has a type, without reading NetBox", async () => {
    const source = netbox([device(12, "pc-0012"), device(13, "PC-0013")], []);
    const { t, admin, editor, siteId } = await importingSite(source);
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "pc",
      identity: { name: "Accueil", hostname: "pc-0013", macs: [] },
    });
    await refresh(editor, siteId);
    expect(await inventory(editor, siteId)).toHaveLength(2);

    await admin.mutation(api.netbox.saveSettings, {
      siteId,
      baseUrl: NETBOX,
      settings: { site: { id: 7, name: "Siège" }, roles: [] },
    });
    source.reads.length = 0;
    await refresh(editor, siteId);

    expect(source.reads).toEqual(["/api/status/"]);
    expect(
      (await inventory(editor, siteId)).map((d) => [
        d.name,
        d.source?.externalId ?? null,
        d.source?.missingSince !== undefined,
      ]),
    ).toEqual([
      ["pc-0012", "12", true],
      ["pc-0013", null, false],
    ]);
    expect(
      await t.run(async (ctx) => await ctx.db.query("importReviews").collect()),
    ).toEqual([]);
    expect((await lastSteps(admin, siteId))?.[0]?.message).toContain(
      "(1 absent de NetBox)",
    );
  });

  it("keeps every link when a new address reaches the same NetBox", async () => {
    const source = netbox([device(12, "pc-0012"), device(13, "PC-0013")], []);
    const { t, admin, editor, siteId } = await importingSite(source);
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "pc",
      identity: { name: "Accueil", hostname: "pc-0013", macs: [] },
    });
    await refresh(editor, siteId);
    const before = await inventory(editor, siteId);

    expect(
      await admin.action(api.sources.saveIntegration, {
        siteId,
        kind: "netbox",
        baseUrl: "https://netbox-https.test",
        enabled: true,
        ignoreCertificateErrors: false,
        token: TOKEN,
      }),
    ).toMatchObject({ ok: true });

    expect(await inventory(editor, siteId)).toEqual(before);
    expect(
      await t.run(async (ctx) => await ctx.db.query("importReviews").collect()),
    ).toHaveLength(1);
    expect(await admin.query(api.netbox.settings, { siteId })).toMatchObject({
      site: { id: 7 },
      roles: [{ id: 4 }, { id: 5 }],
    });
    await refresh(editor, siteId);
    expect(
      (await inventory(editor, siteId)).map((d) => d.source?.missingSince),
    ).toEqual([undefined, undefined]);
  });

  it("asks before another NetBox makes the linked devices absent, then links them by identity only", async () => {
    const devices = [device(12, "pc-0012")];
    const source = netbox(devices, [iface(12, MAC_A)]);
    const { admin, editor, siteId } = await importingSite(source);
    await refresh(editor, siteId);
    const [old] = await inventory(editor, siteId);
    const other = {
      siteId,
      kind: "netbox" as const,
      baseUrl: "https://other-netbox.test",
      enabled: true,
      ignoreCertificateErrors: false,
      token: TOKEN,
    };

    expect(await admin.action(api.sources.saveIntegration, other)).toEqual({
      ok: true,
      message: "Connexion réussie : NetBox 4.6.10.",
      confirmOtherInstance: 1,
    });
    // Nothing was saved before the confirmation.
    expect(
      (await admin.query(api.integrations.listForSite, { siteId }))[0]?.baseUrl,
    ).toBe(NETBOX);

    await admin.action(api.sources.saveIntegration, {
      ...other,
      confirmOtherInstance: true,
    });
    expect(await admin.query(api.netbox.settings, { siteId })).toEqual({
      site: null,
      roles: [],
    });
    const [absent] = await inventory(editor, siteId);
    expect(absent.source).toMatchObject({
      externalId: "12",
      formerInstance: true,
    });
    expect(absent.source?.missingSince).toBeNumber();

    // The other NetBox has its own device 12, and the old one under 30.
    devices.splice(0, 1, device(12, "autre-12"), device(30, "pc-0012"));
    source.lists.interfaces = [iface(30, MAC_A)];
    await admin.mutation(api.netbox.saveSettings, {
      siteId,
      baseUrl: other.baseUrl,
      settings: {
        site: { id: 7, name: "Siège" },
        roles: [{ id: 4, name: "Workstation", type: "pc" }],
      },
    });
    await refresh(editor, siteId);
    const after = await inventory(editor, siteId);
    expect(
      after.map((d) => [d.id === old.id, d.name, d.source?.externalId]),
    ).toEqual([
      [false, "autre-12", "12"],
      [true, "pc-0012", "30"],
    ]);
    expect(after.every((d) => d.source?.missingSince === undefined)).toBe(true);
  });

  it("brings NetBox's ports and cables, keeping the manual ports it names alike", async () => {
    const lists = {
      devices: [
        device(12, "pc-0012", { serial: "SN-12" }),
        device(20, "panel-a", { role: { id: 5 } }),
      ],
      interfaces: [
        { id: 10, device: { id: 12 }, name: "1", mac_address: MAC_A },
      ],
      frontPorts: [
        {
          id: 30,
          device: { id: 20 },
          name: "F1",
          rear_ports: [{ rear_port: 40 }],
        },
      ],
      rearPorts: [{ id: 40, device: { id: 20 }, name: "R1" }],
      cables: [
        {
          id: 100,
          a_terminations: [{ object_type: "dcim.interface", object_id: 10 }],
          b_terminations: [{ object_type: "dcim.frontport", object_id: 30 }],
        },
      ],
    };
    const { t, admin, editor, siteId } = await importingSite(
      netboxServing(lists),
    );
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "pc",
      identity: { name: "Accueil", macs: [MAC_A] },
    });
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:socket",
      type: "wall-port",
      identity: { name: "Prise B-01", macs: [] },
    });
    await editor.mutation(api.cables.connect, {
      id: "cable:manual",
      a: {
        deviceId: "device:manual",
        portId: "port:device:manual:interface:1",
      },
      b: { deviceId: "device:socket", portId: "port:device:socket:front:1" },
    });

    await refresh(editor, siteId);

    const pc = await editor.query(api.cables.portTable, {
      deviceId: "device:manual",
    });
    // The manual port keeps its id; NetBox's cable replaces the manual one.
    expect(pc?.ports).toMatchObject([
      {
        id: "port:device:manual:interface:1",
        name: "1",
        source: { integration: "netbox", externalId: "interface:10" },
        cable: { source: { integration: "netbox", externalId: "100" } },
      },
    ]);
    const cables = async () =>
      await t.run(async (ctx) => await ctx.db.query("cables").collect());
    expect(await cables()).toHaveLength(1);
    const panelPorts = await t.run(async (ctx) =>
      (await ctx.db.query("ports").collect()).filter(
        (port) => port.source?.externalId !== "interface:10" && port.source,
      ),
    );
    expect(panelPorts.map((port) => port.kind).toSorted()).toEqual([
      "front",
      "rear",
    ]);
    const rear = panelPorts.find((port) => port.kind === "rear");
    expect(panelPorts.find((port) => port.kind === "front")).toMatchObject({
      name: "F1",
      rearPortId: rear?.objectId,
    });

    const laid = lists.cables.pop();
    await refresh(editor, siteId);
    expect(await cables()).toEqual([]);

    // Leaving that NetBox for another leaves its cabling in place, as
    // manual.
    if (laid) lists.cables.push(laid);
    await refresh(editor, siteId);
    await admin.action(api.sources.saveIntegration, {
      siteId,
      kind: "netbox",
      baseUrl: "https://other-netbox.test",
      enabled: true,
      ignoreCertificateErrors: false,
      token: TOKEN,
      confirmOtherInstance: true,
    });
    expect((await cables()).map((cable) => cable.source ?? null)).toEqual([
      null,
    ]);
    const ports = await t.run(
      async (ctx) => await ctx.db.query("ports").collect(),
    );
    expect(ports.filter((port) => port.source)).toEqual([]);
  });

  it("keeps an absent device with its MACs and cables, and links it again when NetBox returns it", async () => {
    const lists = {
      devices: [
        device(12, "pc-0012"),
        device(20, "panel-a", { role: { id: 5 } }),
      ],
      interfaces: [
        { id: 10, device: { id: 12 }, name: "1", mac_address: MAC_A },
      ],
      frontPorts: [{ id: 30, device: { id: 20 }, name: "F1" }],
      cables: [
        {
          id: 100,
          a_terminations: [{ object_type: "dcim.interface", object_id: 10 }],
          b_terminations: [{ object_type: "dcim.frontport", object_id: 30 }],
        },
      ],
    };
    const { t, admin, editor, siteId } = await importingSite(
      netboxServing(lists),
    );
    await refresh(editor, siteId);
    const pcId = (await inventory(editor, siteId)).find(
      (d) => d.name === "pc-0012",
    )?.id;

    // Its role changed in NetBox: the import no longer lists it, nor sees
    // its cable's end.
    const [pc] = lists.devices.splice(0, 1);
    await refresh(editor, siteId);
    const absent = (await inventory(editor, siteId)).find((d) => d.id === pcId);
    expect(absent).toMatchObject({
      macs: [MAC_A],
      source: { integration: "netbox", externalId: "12" },
    });
    const since = absent?.source?.missingSince;
    expect(since).toBeNumber();
    const cables = async () =>
      await t.run(async (ctx) => await ctx.db.query("cables").collect());
    expect((await cables()).map((c) => c.source?.externalId)).toEqual(["100"]);

    // A later import keeps the date it first went missing.
    await refresh(editor, siteId);
    expect(
      (await inventory(editor, siteId)).find((d) => d.id === pcId)?.source
        ?.missingSince,
    ).toBe(since);

    lists.devices.unshift(pc);
    await refresh(editor, siteId);
    const back = (await inventory(editor, siteId)).find((d) => d.id === pcId);
    expect(back?.source?.missingSince).toBeUndefined();
    expect(back?.macs).toEqual([MAC_A]);
    expect((await cables()).map((c) => c.source?.externalId)).toEqual(["100"]);
    expect((await lastSteps(admin, siteId))?.[0]?.message).toContain(
      "1 de retour",
    );
  });

  it("purges an absent device after 30 days of imports off the plan, never a placed one", async () => {
    const DAY = 24 * 60 * 60_000;
    const devices = [device(12, "pc-0012"), device(13, "pc-0013")];
    const { t, editor, siteId } = await importingSite(
      netbox(devices, [iface(12, MAC_A)]),
    );
    await refresh(editor, siteId);
    devices.length = 0;
    await refresh(editor, siteId);

    const age = async (
      missingFor: number,
      { importedAgo = 0, offPlanFor = missingFor } = {},
    ) =>
      await t.run(async (ctx) => {
        const now = Date.now();
        for (const row of await ctx.db.query("devices").collect()) {
          if (!row.source) continue;
          await ctx.db.patch(row._id, {
            source: {
              ...row.source,
              missingSince: now - missingFor,
              ...(row.name !== "pc-0013" && { offPlanSince: now - offPlanFor }),
            },
            ...(row.name === "pc-0013" && {
              placement: {
                floorId: "floor:a",
                position: { x: 0, y: 0 },
                size: { width: 80, height: 80 },
              },
            }),
          });
        }
        const cycle = await ctx.db
          .query("siteCycles")
          .withIndex("by_site", (q) => q.eq("siteId", siteId))
          .unique();
        if (cycle) {
          await ctx.db.patch(cycle._id, {
            netboxImportedAt: now - importedAgo,
          });
        }
      });
    const purge = async () => {
      await t.mutation(internal.netboxImport.purgeAbsent, {});
      await t.finishAllScheduledFunctions(() => {});
      return (await inventory(editor, siteId)).map((d) => d.name);
    };

    // Absent while on no floor: its clock runs from the import that missed it.
    expect(await purge()).toEqual(["pc-0012", "pc-0013"]);
    expect(
      (await inventory(editor, siteId)).map(
        (d) => d.source?.offPlanSince !== undefined,
      ),
    ).toEqual([true, true]);

    await age(29 * DAY);
    expect(await purge()).toEqual(["pc-0012", "pc-0013"]);

    // NetBox has not been read for two days: those days do not count.
    await age(31 * DAY, { importedAgo: 2 * DAY });
    expect(await purge()).toEqual(["pc-0012", "pc-0013"]);

    // Absent for long, but taken off a plan yesterday: its 30 days start then.
    await age(40 * DAY, { offPlanFor: DAY });
    expect(await purge()).toEqual(["pc-0012", "pc-0013"]);

    // Archived, a site keeps everything, even a run already scheduled.
    await age(31 * DAY);
    await t.run(async (ctx) => {
      const site = await ctx.db
        .query("sites")
        .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
        .unique();
      if (site) await ctx.db.patch(site._id, { archivedAt: 1 });
    });
    await t.mutation(internal.netboxImport.purgeSite, { siteId });
    expect((await inventory(editor, siteId)).map((d) => d.name)).toEqual([
      "pc-0012",
      "pc-0013",
    ]);
    await t.run(async (ctx) => {
      const site = await ctx.db
        .query("sites")
        .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
        .unique();
      if (site) await ctx.db.patch(site._id, { archivedAt: undefined });
    });

    await age(31 * DAY);
    expect(await purge()).toEqual(["pc-0013"]);
    expect(
      await t.run(async (ctx) => await ctx.db.query("deviceMacs").collect()),
    ).toEqual([]);
  });

  it("ignores an import whose cycle or settings changed meanwhile", async () => {
    const source = netbox([], []);
    const { editor, siteId } = await importingSite(source);
    const stale = await editor.mutation(internal.netboxImport.apply, {
      siteId,
      cycleId: "cycle:gone",
      baseUrl: NETBOX,
      settings: { site: { id: 7, name: "Siège" }, roles: [] },
      devices: [{ externalId: "1", type: "pc", name: "pc-1", macs: [] }],
      ports: [],
      cables: [],
    });
    expect(stale).toBeNull();
    expect(await inventory(editor, siteId)).toEqual([]);
  });
});

describe("Import reviews", () => {
  const reviews = async (client: TestClient, siteId: string) =>
    await client.query(api.importReviews.listForSite, { siteId });

  it("binds a hostname suggestion an Éditeur confirms, and the next import keeps it", async () => {
    const source = netbox([device(12, "PC-0012", { serial: "SN-12" })], []);
    const { editor, siteId } = await importingSite(source);
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "pc",
      identity: { name: "Accueil", hostname: "pc-0012", macs: [], notes: "B4" },
    });
    await refresh(editor, siteId);
    expect(await reviews(editor, siteId)).toMatchObject([
      {
        kind: "suggestion",
        device: { externalId: "12" },
        candidates: [{ id: "device:manual", name: "pc-0012", placed: false }],
      },
    ]);

    await editor.mutation(api.importReviews.resolve, {
      siteId,
      externalId: "12",
      deviceId: "device:manual",
    });
    await refresh(editor, siteId);

    expect(await reviews(editor, siteId)).toEqual([]);
    expect(await inventory(editor, siteId)).toMatchObject([
      {
        id: "device:manual",
        name: "PC-0012",
        serial: "SN-12",
        notes: "B4",
        source: { integration: "netbox", externalId: "12" },
      },
    ]);
  });

  it("offers an absent device for the NetBox device that only shares its name", async () => {
    const devices = [device(12, "pc-0012")];
    const { editor, siteId } = await importingSite(netbox(devices, []));
    await refresh(editor, siteId);
    const [absent] = await inventory(editor, siteId);
    // Deleted and created again in NetBox, under another id.
    devices.splice(0, 1, device(99, "PC-0012"));
    await refresh(editor, siteId);
    expect(await reviews(editor, siteId)).toMatchObject([
      { kind: "suggestion", candidates: [{ id: absent.id }] },
    ]);

    await editor.mutation(api.importReviews.resolve, {
      siteId,
      externalId: "99",
      deviceId: absent.id,
    });

    expect(await inventory(editor, siteId)).toMatchObject([
      { id: absent.id, source: { externalId: "99" } },
    ]);
    const [relinked] = await inventory(editor, siteId);
    expect(relinked.source?.missingSince).toBeUndefined();
  });

  it("keeps a refused suggestion apart as a new device", async () => {
    const source = netbox([device(12, "PC-0012")], []);
    const { editor, siteId } = await importingSite(source);
    await editor.mutation(api.devices.create, {
      siteId,
      deviceId: "device:manual",
      type: "pc",
      identity: { name: "pc-0012", macs: [] },
    });
    await refresh(editor, siteId);

    await editor.mutation(api.importReviews.resolve, {
      siteId,
      externalId: "12",
      deviceId: null,
    });
    await refresh(editor, siteId);

    expect(await reviews(editor, siteId)).toEqual([]);
    expect(
      (await inventory(editor, siteId)).map((d) => [
        d.name,
        d.source?.externalId ?? null,
      ]),
    ).toEqual([
      ["pc-0012", null],
      ["PC-0012", "12"],
    ]);
  });

  it("leaves a conflict to an admin, and a MAC another device holds stays with it", async () => {
    const source = netbox(
      [device(12, "pc-0012")],
      [iface(12, MAC_A), iface(12, MAC_B)],
    );
    const { admin, editor, siteId } = await importingSite(source);
    for (const [id, mac] of [
      ["device:a", MAC_A],
      ["device:b", MAC_B],
    ] as const) {
      await editor.mutation(api.devices.create, {
        siteId,
        deviceId: id,
        type: "pc",
        identity: { name: id, macs: [mac] },
      });
    }
    await refresh(editor, siteId);
    expect(
      (await reviews(editor, siteId)).map((r) => [
        r.kind,
        r.candidates.map((c) => c.id),
      ]),
    ).toEqual([["conflict", ["device:a", "device:b"]]]);

    const choice = { siteId, externalId: "12", deviceId: "device:a" };
    await expect(
      editor.mutation(api.importReviews.resolve, choice),
    ).rejects.toThrow("administrateur");
    await admin.mutation(api.importReviews.resolve, choice);

    const devices = await inventory(editor, siteId);
    expect(devices.map((d) => [d.id, d.macs, d.source?.externalId])).toEqual([
      ["device:b", [MAC_B], undefined],
      ["device:a", [MAC_A], "12"],
    ]);
    await expect(
      admin.mutation(api.importReviews.resolve, choice),
    ).rejects.toThrow("déjà traité");
  });
});
