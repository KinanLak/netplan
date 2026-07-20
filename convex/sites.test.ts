import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";

const configuredSite = (key: string) => ({
  objectId: `site:${key}`,
  configKey: key,
  displayName: key,
  timezone: "Europe/Paris",
  enabled: true,
  dayStartMinute: 420,
  dayEndMinute: 1200,
  netboxInstanceKey: "netbox-main",
  netboxExternalSiteId: key,
  netboxExternalSiteSlug: key,
  libreNmsInstanceKey: "librenms-main",
  libreNmsDevices: [
    {
      externalId: "4",
      hostname: `switch-${key}`,
      networkName: "sw-access-01",
      role: "access" as const,
      localizationTarget: true,
    },
  ],
});

describe("sites", () => {
  it("seeds the confirmed Arles identity idempotently", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(api.sites.ensureDefault, {});
    const second = await t.mutation(api.sites.ensureDefault, {});
    const sites = await t.query(api.sites.list, {});

    expect(first).toBe("site:arles");
    expect(second).toBe(first);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({
      id: "site:arles",
      configKey: "arles",
      timezone: "Europe/Paris",
      netboxExternalSiteId: "1",
      netboxExternalSiteSlug: "arles",
      enabled: true,
    });
    expect(
      sites[0]?.libreNmsDevices
        .filter((device) => device.localizationTarget)
        .map((device) => device.externalId),
    ).toEqual(["4", "5"]);
  });

  it("requires buildings to reference an existing site", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.buildings.create, {
        siteId: "site:missing",
        objectId: "building:missing",
        name: "Missing",
      }),
    ).rejects.toThrow("Site not found");
  });

  it("derives a floor site through its building", async () => {
    const t = convexTest(schema, modules);
    const siteId = await t.mutation(internal.sites.create, {
      site: configuredSite("floor"),
    });
    const buildingId = await t.mutation(api.buildings.create, {
      siteId,
      objectId: "building:floor",
      name: "Building",
    });
    const floorId = await t.mutation(api.floors.create, {
      buildingId,
      objectId: "floor:site",
      name: "Floor",
    });

    const site = await t.query(api.sites.getForFloor, { floorId });
    expect(site?.id).toBe(siteId);
  });

  it("rejects duplicate configuration identities", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.sites.create, { site: configuredSite("first") });
    await expect(
      t.mutation(internal.sites.create, {
        site: {
          ...configuredSite("second"),
          configKey: "first",
        },
      }),
    ).rejects.toThrow("already exists");
  });

  it("rejects non-canonical LibreNMS device IDs", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.sites.create, {
        site: {
          ...configuredSite("invalid-switch"),
          libreNmsDevices: [
            {
              externalId: "switch:4",
              hostname: "switch",
              networkName: "sw-access-01",
              role: "access",
              localizationTarget: true,
            },
          ],
        },
      }),
    ).rejects.toThrow("canonical number");
  });

  it("rejects a reused site object ID with different configuration", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.sites.create, { site: configuredSite("object") });
    await expect(
      t.mutation(internal.sites.create, {
        site: {
          ...configuredSite("object"),
          displayName: "Different",
        },
      }),
    ).rejects.toThrow("different configuration");
  });

  it("atomically disables active workflows and allows a clean re-enable", async () => {
    const t = convexTest(schema, modules);
    const siteId = await t.mutation(internal.sites.create, {
      site: configuredSite("disable"),
    });
    const attempt = await t.mutation(internal.integrations.begin, {
      siteId,
      workflow: "netbox",
      attemptId: "attempt:disable",
      leaseId: "lease:disable",
      origin: "manual",
    });

    await t.mutation(internal.sites.setEnabled, { siteId, enabled: false });
    let state = await t.query(api.integrations.getState, {
      siteId,
      workflow: "netbox",
    });
    expect(state).toMatchObject({ status: "disabled" });
    expect(state?.activeAttemptId).toBeUndefined();
    await expect(
      t.mutation(internal.integrations.heartbeat, {
        siteId,
        workflow: "netbox",
        attemptId: attempt.attemptId,
        leaseId: attempt.leaseId,
        fence: attempt.fence,
      }),
    ).rejects.toThrow("replaced");

    await t.mutation(internal.sites.setEnabled, { siteId, enabled: true });
    state = await t.query(api.integrations.getState, {
      siteId,
      workflow: "netbox",
    });
    expect(state?.status).toBe("idle");
  });

  it("rejects a default-map identity owned by another site", async () => {
    const t = convexTest(schema, modules);
    const siteA = await t.mutation(internal.sites.create, {
      site: configuredSite("map-a"),
    });
    const siteB = await t.mutation(internal.sites.create, {
      site: configuredSite("map-b"),
    });
    await t.mutation(api.buildings.create, {
      siteId: siteB,
      objectId: `building:${siteA}:default`,
      name: "Collision",
    });

    await expect(
      t.mutation(api.buildings.createDefaultMap, { siteId: siteA }),
    ).rejects.toThrow("another site");
  });

  it("refuses deletion while a site owns durable data", async () => {
    const t = convexTest(schema, modules);
    const siteId = await t.mutation(internal.sites.create, {
      site: configuredSite("guard"),
    });
    await t.mutation(api.buildings.create, {
      siteId,
      objectId: "building:guard",
      name: "Guard",
    });

    await expect(t.mutation(internal.sites.remove, { siteId })).rejects.toThrow(
      "durable data",
    );
  });

  it("removes pristine workflow states with an unused site", async () => {
    const t = convexTest(schema, modules);
    const siteId = await t.mutation(internal.sites.create, {
      site: configuredSite("unused"),
    });

    await t.mutation(internal.sites.remove, { siteId });
    expect(await t.query(api.sites.get, { siteId })).toBeNull();
    await t.run(async (ctx) => {
      expect(
        await ctx.db.query("integrationWorkflowStates").collect(),
      ).toHaveLength(0);
    });
  });
});
