import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { api } from "./_generated/api";
import {
  createSignedInUser,
  createTestSite,
  testBackend,
} from "./_test/auth.setup";
import { stubFetch } from "./_test/fetch";
import type { DeviceStatus, DeviceType } from "../src/types/map";

let fetchStub: ReturnType<typeof stubFetch>;

beforeEach(() => {
  process.env.NETPLAN_SECRET_KEY = randomBytes(32).toString("base64");
  fetchStub = stubFetch(() => Response.json({ "netbox-version": "4.6.10" }));
});

afterEach(() => {
  fetchStub.restore();
  delete process.env.NETPLAN_SECRET_KEY;
});

const admin = async () => {
  const t = testBackend();
  return t.withIdentity((await createSignedInUser(t, "admin")).identity);
};

describe("the admin health overview", () => {
  it("summarizes each site's last cycle, NetBox import and switch statuses", async () => {
    const t = await admin();
    const quiet = await createTestSite(t, { name: "Site B" });
    const busy = await createTestSite(t, { name: "Site A" });
    await t.action(api.sources.saveIntegration, {
      siteId: busy,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      enabled: true,
      ignoreCertificateErrors: false,
      token: "a-token-for-tests", // gitleaks:allow
    });
    const last = {
      startedAt: 1_000,
      finishedAt: 2_000,
      manual: false,
      steps: [
        { source: "netbox" as const, ok: true, message: "12 importés." },
        {
          source: "librenms" as const,
          ok: false,
          message: "« pile » : LibreNMS a répondu 503.",
          switches: [
            { name: "coeur", ok: true, notes: [] },
            { name: "pile", ok: false, notes: ["LibreNMS a répondu 503."] },
          ],
        },
      ],
    };
    await t.run(async (ctx) => {
      await ctx.db.insert("integrations", {
        siteId: busy,
        kind: "librenms",
        baseUrl: "https://librenms.test",
        enabled: true,
        token: { keyId: "k", iv: "iv", ciphertext: "c" },
        updatedAt: 0,
      });
      await ctx.db.insert("siteCycles", {
        siteId: busy,
        nextRunAt: 3_000,
        failures: 1,
        last,
        netboxImportedAt: 1_500,
      });
      const devices: Array<[DeviceType, DeviceStatus | undefined]> = [
        ["switch", "up"],
        ["switch", "up"],
        ["switch", "down"],
        ["switch", undefined],
        ["pc", "down"],
      ];
      for (const [index, [type, status]] of devices.entries()) {
        await ctx.db.insert("devices", {
          objectId: `device:${index}`,
          siteId: busy,
          type,
          name: `${type}-${index}`,
          macs: [],
          metadata: status ? { status } : {},
          updatedAt: 0,
          updatedBy: "test",
        });
      }
    });

    const [first, second] = await t.query(api.health.overview, {});

    expect(first).toMatchObject({
      id: busy,
      name: "Site A",
      freshness: { hasSources: true, failures: 1, nextRunAt: 3_000 },
      last,
      netbox: { importedAt: 1_500 },
      switches: { up: 2, down: 1, unknown: 1 },
      // No switch is mapped to a LibreNMS device in this site's settings.
      switchReads: { read: 0, failed: 0, notPolled: 4, oldestReadAt: null },
    });
    expect(second).toMatchObject({
      id: quiet,
      freshness: { hasSources: false, lastSuccessAt: null },
      last: null,
      netbox: null,
      switches: { up: 0, down: 0, unknown: 0 },
      switchReads: null,
    });
  });

  it("names no NetBox import while NetBox is disabled", async () => {
    const t = await admin();
    const siteId = await createTestSite(t);
    await t.action(api.sources.saveIntegration, {
      siteId,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      enabled: false,
      ignoreCertificateErrors: false,
      token: "a-token-for-tests", // gitleaks:allow
    });

    const [site] = await t.query(api.health.overview, {});

    expect(site.netbox).toBeNull();
  });

  it("counts switches one by one, a stack's included", async () => {
    const t = await admin();
    const siteId = await createTestSite(t);
    const device = { id: 7, name: "pile" };
    await t.run(async (ctx) => {
      await ctx.db.insert("integrations", {
        siteId,
        kind: "librenms",
        baseUrl: "https://librenms.test",
        enabled: true,
        token: { keyId: "k", iv: "iv", ciphertext: "c" },
        updatedAt: 0,
        librenms: {
          switches: [
            { switchId: "device:a", device },
            { switchId: "device:b", device },
            { switchId: "device:c", device: { id: 8, name: "seul" } },
          ],
        },
      });
      for (const objectId of ["device:a", "device:b", "device:c", "device:d"]) {
        await ctx.db.insert("devices", {
          objectId,
          siteId,
          type: "switch",
          name: objectId,
          macs: [],
          metadata: {},
          updatedAt: 0,
          updatedBy: "test",
        });
      }
      await ctx.db.insert("siteCycles", {
        siteId,
        nextRunAt: 3_000,
        failures: 1,
        last: {
          startedAt: 1_000,
          finishedAt: 2_000,
          manual: false,
          steps: [
            {
              source: "librenms",
              ok: false,
              message: "1 switch lu sur 2, 0 MAC vue.",
              switches: [
                { name: "pile", ok: true, notes: [] },
                { name: "seul", ok: false, notes: ["LibreNMS a répondu 503."] },
              ],
            },
          ],
        },
        switchReads: [
          { switchId: "device:a", readAt: 1_500 },
          { switchId: "device:b", readAt: 1_500 },
          { switchId: "device:c", readAt: 500 },
        ],
      });
    });

    const [site] = await t.query(api.health.overview, {});

    expect(site.switchReads).toEqual({
      read: 2,
      failed: 1,
      notPolled: 1,
      oldestReadAt: 500,
    });
  });

  it("leaves out the steps of a source removed since the last cycle", async () => {
    const t = await admin();
    const siteId = await createTestSite(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("siteCycles", {
        siteId,
        nextRunAt: 3_000,
        failures: 0,
        last: {
          startedAt: 1_000,
          finishedAt: 2_000,
          manual: false,
          steps: [{ source: "netbox", ok: true, message: "12 importés." }],
        },
      });
    });

    const [site] = await t.query(api.health.overview, {});
    const status = await t.query(api.collection.status, { siteId });

    expect(site.last?.steps).toEqual([]);
    expect(status.last?.steps).toEqual([]);
  });

  it("names the integrations that ignore certificate errors", async () => {
    const t = await admin();
    const siteId = await createTestSite(t);
    const token = { keyId: "k", iv: "iv", ciphertext: "c" };
    await t.run(async (ctx) => {
      for (const [kind, ignoreCertificateErrors] of [
        ["netbox", undefined],
        ["librenms", true],
      ] as const) {
        await ctx.db.insert("integrations", {
          siteId,
          kind,
          baseUrl: `https://${kind}.test`,
          enabled: true,
          token,
          updatedAt: 0,
          ...(ignoreCertificateErrors && { ignoreCertificateErrors }),
        });
      }
    });

    const [site] = await t.query(api.health.overview, {});

    expect(site.ignoringCertificates).toEqual(["librenms"]);
  });
});
