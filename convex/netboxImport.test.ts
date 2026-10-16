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

/** A NetBox that lists these devices and interfaces, one page each. */
const netbox = (devices: Array<Raw>, interfaces: Array<Raw>) => {
  const reads: Array<string> = [];
  const answer = (url: string) => {
    const { pathname } = new URL(url);
    reads.push(pathname);
    if (pathname === "/api/status/") {
      return Response.json({ "netbox-version": "4.6.10" });
    }
    const results = pathname === "/api/dcim/devices/" ? devices : interfaces;
    return Response.json({ count: results.length, results });
  };
  return { answer, reads };
};

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

/** A site whose NetBox imports role 4 of NetBox site 7 as computers. */
async function importingSite(source: ReturnType<typeof netbox>) {
  fetchStub = stubFetch(source.answer);
  const t = testBackend();
  const editor = t.withIdentity(
    (await createSignedInUser(t, "editor")).identity,
  );
  const admin = t.withIdentity((await createSignedInUser(t, "admin")).identity);
  const siteId = await createTestSite(admin);
  await admin.action(api.integrations.save, {
    siteId,
    kind: "netbox",
    baseUrl: NETBOX,
    enabled: true,
    token: TOKEN,
  });
  await admin.mutation(api.netbox.saveSettings, {
    siteId,
    baseUrl: NETBOX,
    settings: {
      site: { id: 7, name: "Siège" },
      roles: [{ id: 4, name: "Workstation", type: "pc" }],
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
        message:
          "Connexion réussie : NetBox 4.6.10. Import : 2 équipements (1 nouveau, 1 rattaché).",
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

  it("imports at most every 15 minutes outside a manual refresh, and drops what NetBox dropped", async () => {
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
    expect((await inventory(editor, siteId)).map((d) => d.name)).toEqual([
      "pc-0012",
    ]);
    expect((await lastSteps(admin, siteId))?.[0]?.message).toContain(
      "(1 retiré)",
    );
  });

  it("waits for a person when only a hostname matches", async () => {
    const source = netbox([device(12, "PC-0012")], []);
    const { t, editor, siteId } = await importingSite(source);
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
  });

  it("ignores an import whose cycle or settings changed meanwhile", async () => {
    const source = netbox([], []);
    const { editor, siteId } = await importingSite(source);
    const stale = await editor.mutation(internal.netboxImport.apply, {
      siteId,
      cycleId: "cycle:gone",
      baseUrl: NETBOX,
      netboxSiteId: 7,
      devices: [{ externalId: "1", type: "pc", name: "pc-1", macs: [] }],
    });
    expect(stale).toBeNull();
    expect(await inventory(editor, siteId)).toEqual([]);
  });
});
