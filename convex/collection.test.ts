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
import { DEFAULT_CADENCE } from "../src/sites/settings";

const TOKEN = "a-token-for-tests"; // gitleaks:allow
const NETBOX_OK = () => Response.json({ "netbox-version": "4.6.10" });

let fetchStub: ReturnType<typeof stubFetch>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
  fetchStub = stubFetch(NETBOX_OK);
});

afterEach(() => {
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
  delete process.env.NETPLAN_COLLECTION_PAUSED;
});

/** An admin and an éditeur on one backend. */
async function team() {
  const t = testBackend();
  const as = async (role: "admin" | "editor") =>
    t.withIdentity((await createSignedInUser(t, role)).identity);
  return { admin: await as("admin"), editor: await as("editor") };
}

/** A site with an enabled NetBox, as an admin sets it up. */
async function siteWithNetBox(given?: TestClient) {
  const { admin, editor } = given
    ? { admin: given, editor: given }
    : await team();
  const siteId = await createTestSite(admin);
  await admin.action(api.integrations.save, {
    siteId,
    kind: "netbox",
    baseUrl: "https://netbox.test",
    enabled: true,
    token: TOKEN,
  });
  return { admin, editor, siteId };
}

// Real timers: this only yields until the scheduled cycles have run.
const settle = (t: TestClient) => t.finishAllScheduledFunctions(() => {});

const startDue = (t: TestClient) =>
  t.mutation(internal.collection.startDue, {});

const status = (t: TestClient, siteId: string) =>
  t.query(api.collection.status, { siteId });

describe("collection cycles", () => {
  it("starts a due site's cycle, asks each enabled source, and plans the next", async () => {
    const { admin, siteId } = await siteWithNetBox();
    const before = fetchStub.calls.length;

    expect(await startDue(admin)).toBe(1);
    expect((await status(admin, siteId)).running).toMatchObject({
      manual: false,
    });
    await settle(admin);

    const after = await status(admin, siteId);
    expect(after.running).toBeNull();
    expect(after.failures).toBe(0);
    expect(after.last?.steps).toEqual([
      {
        source: "netbox",
        ok: true,
        message:
          "Connexion réussie : NetBox 4.6.10. Aucun site NetBox choisi : rien n'est importé.",
      },
    ]);
    expect(fetchStub.calls.slice(before).map(([url]) => url)).toEqual([
      "https://netbox.test/api/status/",
    ]);
    const { startedAt } = after.last ?? { startedAt: 0 };
    expect(after.nextRunAt).toBeGreaterThan(startedAt);

    // Not due again until then.
    expect(await startDue(admin)).toBe(0);
  });

  it("leaves alone a site with no enabled source, automatic cycles off, or collection paused", async () => {
    const { admin } = await team();
    await createTestSite(admin);
    expect(await startDue(admin)).toBe(0);

    const { siteId } = await siteWithNetBox(admin);
    const site = await admin.query(api.sites.getSettings, { siteId });
    if (!site) throw new Error("expected the site");
    await admin.mutation(api.sites.update, {
      siteId,
      name: site.name,
      timezone: site.timezone,
      cadence: site.cadence,
      automaticRefresh: false,
      manualRefresh: true,
    });
    expect(await startDue(admin)).toBe(0);

    await admin.mutation(api.sites.update, {
      siteId,
      name: site.name,
      timezone: site.timezone,
      cadence: site.cadence,
      automaticRefresh: true,
      manualRefresh: true,
    });
    process.env.NETPLAN_COLLECTION_PAUSED = "true";
    expect(await startDue(admin)).toBe(0);
    expect((await status(admin, siteId)).paused).toBe(true);
    delete process.env.NETPLAN_COLLECTION_PAUSED;
    expect(await startDue(admin)).toBe(1);
    await settle(admin);
  });

  it("lets an éditeur refresh at once, but not twice at a time", async () => {
    const { admin, editor, siteId } = await siteWithNetBox();

    await editor.mutation(api.collection.refresh, { siteId });
    await expect(
      editor.mutation(api.collection.refresh, { siteId }),
    ).rejects.toThrow("déjà en cours");
    // The cron does not start a second one either.
    expect(await startDue(admin)).toBe(0);
    await settle(admin);
    expect((await status(admin, siteId)).last?.manual).toBe(true);

    await editor.mutation(api.collection.refresh, { siteId });
    await settle(admin);
  });

  it("refuses a refresh the site turned off, or with nothing to ask", async () => {
    const { admin, siteId } = await siteWithNetBox();
    const site = await admin.query(api.sites.getSettings, { siteId });
    if (!site) throw new Error("expected the site");
    await admin.mutation(api.sites.update, {
      siteId,
      name: site.name,
      timezone: site.timezone,
      cadence: site.cadence,
      automaticRefresh: true,
      manualRefresh: false,
    });
    await expect(
      admin.mutation(api.collection.refresh, { siteId }),
    ).rejects.toThrow("désactivée");

    const bare = await createTestSite(admin);
    await expect(
      admin.mutation(api.collection.refresh, { siteId: bare }),
    ).rejects.toThrow("aucune intégration active");

    process.env.NETPLAN_COLLECTION_PAUSED = "true";
    await admin.mutation(api.sites.update, {
      siteId,
      name: site.name,
      timezone: site.timezone,
      cadence: site.cadence,
      automaticRefresh: true,
      manualRefresh: true,
    });
    await expect(
      admin.mutation(api.collection.refresh, { siteId }),
    ).rejects.toThrow("suspendue");
  });

  it("records a source's refusal and backs off", async () => {
    const { admin, siteId } = await siteWithNetBox();
    fetchStub.restore();
    fetchStub = stubFetch(() => new Response("", { status: 403 }));

    await admin.mutation(api.collection.refresh, { siteId });
    await settle(admin);
    const first = await status(admin, siteId);
    expect(first.failures).toBe(1);
    expect(first.last?.steps).toEqual([
      { source: "netbox", ok: false, message: "NetBox refuse ce jeton (403)." },
    ]);

    await admin.mutation(api.collection.refresh, { siteId });
    await settle(admin);
    const second = await status(admin, siteId);
    expect(second.failures).toBe(2);
    const { startedAt } = second.last ?? { startedAt: 0 };
    // Ten minutes after two failures, wherever the clock stands.
    expect(second.nextRunAt).toBeGreaterThanOrEqual(startedAt + 10 * 60_000);

    fetchStub.restore();
    fetchStub = stubFetch(NETBOX_OK);
    await admin.mutation(api.collection.refresh, { siteId });
    await settle(admin);
    expect((await status(admin, siteId)).failures).toBe(0);
  });

  it("ignores the report of a cycle whose lease was taken over", async () => {
    const { admin, siteId } = await siteWithNetBox();
    await admin.run(async (ctx) => {
      await ctx.db.insert("siteCycles", {
        siteId,
        nextRunAt: 0,
        failures: 0,
        running: {
          cycleId: "current",
          startedAt: Date.now(),
          leaseUntil: Date.now() + 60_000,
          manual: false,
        },
      });
    });
    await admin.mutation(internal.collection.finish, {
      siteId,
      cycleId: "stale",
      steps: [],
    });
    expect((await status(admin, siteId)).running).not.toBeNull();

    // A lease that ran out lets the next cycle start.
    await admin.run(async (ctx) => {
      const cycle = await ctx.db.query("siteCycles").first();
      if (!cycle?.running) throw new Error("expected the cycle");
      await ctx.db.patch(cycle._id, {
        running: { ...cycle.running, leaseUntil: Date.now() - 1 },
      });
    });
    expect((await status(admin, siteId)).running).toBeNull();
    expect(await startDue(admin)).toBe(1);
    await settle(admin);
  });

  it("drops a queued cycle once collection is paused", async () => {
    const { admin, siteId } = await siteWithNetBox();
    const before = fetchStub.calls.length;
    await admin.mutation(api.collection.refresh, { siteId });
    process.env.NETPLAN_COLLECTION_PAUSED = "true";
    await settle(admin);

    const after = await status(admin, siteId);
    expect(after.running).toBeNull();
    expect(after.last).toBeNull();
    expect(fetchStub.calls.length).toBe(before);
  });

  it("renews the lease when the cycle starts, and counts a dead cycle as a failure", async () => {
    const { admin, siteId } = await siteWithNetBox();
    const insertRunning = (cycleId: string, leaseUntil: number) =>
      admin.run(async (ctx) => {
        const cycle = await ctx.db.query("siteCycles").first();
        const running = {
          cycleId,
          startedAt: Date.now(),
          leaseUntil,
          manual: false,
        };
        if (cycle) await ctx.db.patch(cycle._id, { running });
        else {
          await ctx.db.insert("siteCycles", {
            siteId,
            nextRunAt: 0,
            failures: 0,
            running,
          });
        }
      });
    const leaseUntil = async () =>
      await admin.run(
        async (ctx) =>
          (await ctx.db.query("siteCycles").first())?.running?.leaseUntil ??
          null,
      );

    // Queued for a while: almost out of lease when it starts.
    await insertRunning("queued", Date.now() + 1000);
    expect(
      await admin.mutation(internal.collection.claim, {
        siteId,
        cycleId: "queued",
      }),
    ).toEqual(["netbox"]);
    expect(await leaseUntil()).toBeGreaterThan(Date.now() + 14 * 60_000);

    // Its expiry does nothing while the lease holds.
    await admin.mutation(internal.collection.expire, {
      siteId,
      cycleId: "queued",
    });
    expect((await status(admin, siteId)).running).not.toBeNull();

    await insertRunning("dead", Date.now() - 1);
    await admin.mutation(internal.collection.expire, {
      siteId,
      cycleId: "dead",
    });
    const after = await status(admin, siteId);
    expect(after.running).toBeNull();
    expect(after.failures).toBe(1);
    expect(await leaseUntil()).toBeNull();
  });

  it("brings the next cycle forward for a shorter cadence, and goes with its site", async () => {
    const { admin, siteId } = await siteWithNetBox();
    await admin.mutation(api.collection.refresh, { siteId });
    await settle(admin);
    const planned = await status(admin, siteId);
    const startedAt = planned.last?.startedAt ?? 0;

    const site = await admin.query(api.sites.getSettings, { siteId });
    if (!site) throw new Error("expected the site");
    const every = (minutes: number) => ({
      siteId,
      name: site.name,
      timezone: site.timezone,
      automaticRefresh: true,
      manualRefresh: true,
      cadence: {
        ...DEFAULT_CADENCE,
        businessIntervalMinutes: minutes,
        otherIntervalMinutes: minutes,
      },
    });
    await admin.mutation(api.sites.update, every(5));
    expect((await status(admin, siteId)).nextRunAt).toBe(
      startedAt + 5 * 60_000,
    );
    // A longer one keeps the cycle already planned.
    await admin.mutation(api.sites.update, every(120));
    expect((await status(admin, siteId)).nextRunAt).toBe(
      startedAt + 5 * 60_000,
    );

    await admin.mutation(api.integrations.remove, { siteId, kind: "netbox" });
    await admin.mutation(api.sites.remove, { siteId });
    const cycles = await admin.run(
      async (ctx) => await ctx.db.query("siteCycles").collect(),
    );
    expect(cycles).toEqual([]);
  });
});
