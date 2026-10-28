import { describe, expect, it } from "bun:test";
import { api } from "./_generated/api";
import { signedInTest } from "./_test/auth.setup";
import { DEFAULT_INTERVAL_MINUTES } from "../src/sites/settings";

const arles = { name: "Arles", timezone: "Europe/Paris" };

describe("sites", () => {
  it("an admin creates a site with the default cadence, and everyone lists it", async () => {
    const admin = await signedInTest("admin");
    const siteId = await admin.mutation(api.sites.create, {
      name: "  Arles ",
      timezone: "Europe/Paris",
    });

    expect(siteId).toMatch(/^site:/);
    expect(await admin.query(api.sites.getSettings, { siteId })).toEqual({
      id: siteId,
      name: "Arles",
      timezone: "Europe/Paris",
      archived: false,
      archivedAt: null,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      automaticRefresh: true,
      manualRefresh: true,
      buildingCount: 0,
    });
    expect(await admin.query(api.sites.list, {})).toEqual([
      { id: siteId, name: "Arles", timezone: "Europe/Paris", archived: false },
    ]);
  });

  it("lists sites by name", async () => {
    const admin = await signedInTest("admin");
    for (const name of ["Évry", "Arles", "Lyon"]) {
      await admin.mutation(api.sites.create, { ...arles, name });
    }
    const names = (await admin.query(api.sites.list, {})).map((s) => s.name);
    expect(names).toEqual(["Arles", "Évry", "Lyon"]);
  });

  it("refuses a second site with the same name, whatever the case", async () => {
    const admin = await signedInTest("admin");
    const first = await admin.mutation(api.sites.create, arles);
    await expect(
      admin.mutation(api.sites.create, { ...arles, name: "ARLES" }),
    ).rejects.toThrow("déjà ce nom");

    const second = await admin.mutation(api.sites.create, {
      ...arles,
      name: "Lyon",
    });
    await expect(
      admin.mutation(api.sites.update, {
        siteId: second,
        ...arles,
        intervalMinutes: DEFAULT_INTERVAL_MINUTES,
        automaticRefresh: true,
        manualRefresh: true,
      }),
    ).rejects.toThrow("déjà ce nom");
    // Renaming a site to its own name in another case is not a conflict.
    await admin.mutation(api.sites.update, {
      siteId: first,
      name: "arles",
      timezone: "Europe/Paris",
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      automaticRefresh: true,
      manualRefresh: true,
    });
  });

  it("refuses invalid settings with the reason the admin sees", async () => {
    const admin = await signedInTest("admin");
    await expect(
      admin.mutation(api.sites.create, { ...arles, timezone: "Mars/Olympus" }),
    ).rejects.toThrow("fuseau horaire");
    const siteId = await admin.mutation(api.sites.create, arles);
    await expect(
      admin.mutation(api.sites.update, {
        siteId,
        ...arles,
        intervalMinutes: 1,
        automaticRefresh: true,
        manualRefresh: true,
      }),
    ).rejects.toThrow("intervalle");
  });

  it("saves the interval and the refresh switches", async () => {
    const admin = await signedInTest("admin");
    const siteId = await admin.mutation(api.sites.create, arles);
    await admin.mutation(api.sites.update, {
      siteId,
      name: "Arles",
      timezone: "America/Montreal",
      intervalMinutes: 10,
      automaticRefresh: false,
      manualRefresh: true,
    });

    expect(await admin.query(api.sites.getSettings, { siteId })).toMatchObject({
      timezone: "America/Montreal",
      intervalMinutes: 10,
      automaticRefresh: false,
      manualRefresh: true,
    });
  });

  it("requires buildings to reference an existing site", async () => {
    const t = await signedInTest();
    await expect(
      t.mutation(api.buildings.create, {
        siteId: "site:missing",
        objectId: "building:missing",
        name: "Missing",
      }),
    ).rejects.toThrow("Ce site n'existe plus.");
  });

  it("refuses to remove a site that still has buildings", async () => {
    const admin = await signedInTest("admin");
    const siteId = await admin.mutation(api.sites.create, arles);
    await admin.mutation(api.buildings.create, {
      siteId,
      objectId: "building:guard",
      name: "Guard",
    });

    await expect(admin.mutation(api.sites.remove, { siteId })).rejects.toThrow(
      "bâtiments",
    );
    expect(await admin.query(api.sites.getSettings, { siteId })).toMatchObject({
      buildingCount: 1,
    });
  });

  it("lists each site with what it holds and connects to, and its floors", async () => {
    const admin = await signedInTest("admin");
    const siteId = await admin.mutation(api.sites.create, arles);
    await admin.mutation(api.buildings.create, {
      siteId,
      objectId: "building:a",
      name: "A",
      firstFloor: { objectId: "floor:rdc", name: "RDC" },
    });
    await admin.run(async (ctx) => {
      const floor = await ctx.db.query("floors").first();
      await ctx.db.insert("devices", {
        objectId: "device:pc",
        siteId,
        type: "pc",
        name: "pc",
        macs: [],
        metadata: {},
        updatedAt: 0,
        updatedBy: "test",
        placement: {
          floorId: floor?.objectId ?? "",
          position: { x: 0, y: 0 },
          size: { width: 20, height: 20 },
        },
      });
      await ctx.db.insert("integrations", {
        siteId,
        kind: "librenms",
        baseUrl: "https://librenms.test",
        enabled: false,
        token: { keyId: "k", iv: "iv", ciphertext: "c" },
        updatedAt: 0,
      });
    });

    const [listed] = await admin.query(api.sites.listSettings, {});
    expect(listed).toMatchObject({
      buildingCount: 1,
      floorCount: 1,
      integrations: [{ kind: "librenms", enabled: false }],
    });
    expect(await admin.query(api.sites.structure, { siteId })).toEqual([
      {
        id: "building:a",
        name: "A",
        floors: [{ id: "floor:rdc", name: "RDC", devices: 1 }],
      },
    ]);
  });

  it("archives a site out of the picker, keeps its settings, and brings it back", async () => {
    const admin = await signedInTest("admin");
    const siteId = await admin.mutation(api.sites.create, arles);

    await admin.mutation(api.sites.setArchived, { siteId, archived: true });
    expect(await admin.query(api.sites.list, {})).toMatchObject([
      { id: siteId, archived: true },
    ]);
    expect(await admin.query(api.sites.getSettings, { siteId })).toMatchObject({
      archived: true,
      archivedAt: expect.any(Number),
    });
    // Its admin settings stay editable.
    await admin.mutation(api.sites.update, {
      siteId,
      name: "Arles (ancien)",
      timezone: "Europe/Paris",
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      automaticRefresh: true,
      manualRefresh: true,
    });

    await admin.mutation(api.sites.setArchived, { siteId, archived: false });
    expect(await admin.query(api.sites.getSettings, { siteId })).toMatchObject({
      archived: false,
      archivedAt: null,
      name: "Arles (ancien)",
    });
  });

  it("removes an empty site", async () => {
    const admin = await signedInTest("admin");
    const siteId = await admin.mutation(api.sites.create, arles);

    await admin.mutation(api.sites.remove, { siteId });
    expect(await admin.query(api.sites.getSettings, { siteId })).toBeNull();
    expect(await admin.query(api.sites.list, {})).toEqual([]);
  });
});
