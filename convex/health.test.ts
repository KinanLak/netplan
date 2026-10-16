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
    await t.action(api.integrations.save, {
      siteId: busy,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      enabled: true,
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
    });
    expect(second).toMatchObject({
      id: quiet,
      freshness: { hasSources: false, lastSuccessAt: null },
      last: null,
      netbox: null,
      switches: { up: 0, down: 0, unknown: 0 },
    });
  });

  it("names no NetBox import while NetBox is disabled", async () => {
    const t = await admin();
    const siteId = await createTestSite(t);
    await t.action(api.integrations.save, {
      siteId,
      kind: "netbox",
      baseUrl: "https://netbox.test",
      enabled: false,
      token: "a-token-for-tests", // gitleaks:allow
    });

    const [site] = await t.query(api.health.overview, {});

    expect(site.netbox).toBeNull();
  });
});
