import { describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import type { Infer } from "convex/values";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";
import type { connectionInput, inventoryInput } from "./netboxModel";

let sequence = 0;

const emptySwitchResult = (externalId = "4") => ({
  externalId,
  status: "success" as const,
  observationCount: 0,
  rawFdbCount: 0,
  freshFdbCount: 0,
  staleFdbCount: 0,
  triggerStartedAt: 0,
  discoveryCompletedAt: 0,
  serverObservedAt: 0,
});

const siteInput = (key: string) => ({
  objectId: `site:${key}`,
  configKey: key,
  displayName: key.toUpperCase(),
  timezone: "Europe/Paris",
  enabled: true,
  dayStartMinute: 420,
  dayEndMinute: 1200,
  netboxInstanceKey: `netbox:${key}`,
  netboxExternalSiteId: `netbox-site:${key}`,
  netboxExternalSiteSlug: key,
  libreNmsInstanceKey: "librenms-main",
  libreNmsDevices: [
    {
      externalId: "4",
      hostname: `access-${key}`,
      networkName: "sw-access-01",
      role: "access" as const,
      localizationTarget: true,
    },
  ],
});

const snapshot = (name: string) => ({
  inventory: [
    {
      externalId: "device:pc",
      type: "pc" as const,
      name: `PC ${name}`,
      role: "Workstation",
      locationPath: ["Bureau"],
      macs: ["AA:BB:CC:DD:EE:FF"],
      interfaceCount: 1,
      cabledTerminationCount: 0,
      lifecycleStatus: "active",
      url: `https://netbox.example/${name}/pc`,
    },
    {
      externalId: "device:socket",
      type: "wall-port" as const,
      name: `Socket ${name}`,
      role: "Wall Socket",
      locationPath: ["Bureau"],
      macs: [],
      interfaceCount: 1,
      cabledTerminationCount: 1,
      lifecycleStatus: "active",
      url: `https://netbox.example/${name}/socket`,
    },
    {
      externalId: "device:switch",
      type: "switch" as const,
      name: "sw-access-01-1",
      role: "Switch Access",
      locationPath: ["Bureau"],
      macs: [],
      interfaceCount: 48,
      cabledTerminationCount: 1,
      lifecycleStatus: "active",
      url: `https://netbox.example/${name}/switch`,
    },
  ],
  connections: [
    {
      externalId: "cable:1",
      fromExternalId: "device:switch",
      fromPort: "Gi1/0/1",
      fromTerminationExternalId: "interface:switch",
      fromTerminationKind: "interface" as const,
      fromPeerTerminationExternalIds: [],
      toExternalId: "device:socket",
      toPort: "0",
      toTerminationExternalId: "interface:socket",
      toTerminationKind: "interface" as const,
      toPeerTerminationExternalIds: [],
    },
  ],
});

async function createSite(t: ReturnType<typeof convexTest>, key: string) {
  return await t.mutation(internal.sites.create, { site: siteInput(key) });
}

async function begin(
  t: ReturnType<typeof convexTest>,
  siteId: string,
  workflow: "netbox" | "localization",
) {
  sequence += 1;
  return await t.mutation(internal.integrations.begin, {
    siteId,
    workflow,
    attemptId: `attempt:${sequence}`,
    leaseId: `lease:${sequence}`,
    origin: "manual",
  });
}

async function publishNetBox(
  t: ReturnType<typeof convexTest>,
  siteId: string,
  name: string,
  data: {
    inventory: Array<Infer<typeof inventoryInput>>;
    connections: Array<Infer<typeof connectionInput>>;
  } = snapshot(name),
) {
  const attempt = await begin(t, siteId, "netbox");
  const site = siteInput(siteId.replace("site:", ""));
  const generationId = `generation:${name}`;
  const result = await t.mutation(internal.netboxModel.publishGeneration, {
    siteId,
    attemptId: attempt.attemptId,
    leaseId: attempt.leaseId,
    fence: attempt.fence,
    generationId,
    instanceKey: site.netboxInstanceKey,
    externalSiteId: site.netboxExternalSiteId,
    externalSiteSlug: site.netboxExternalSiteSlug,
    capturedAt: sequence,
    sourceVersion: "4.1.11",
    ...data,
  });
  return { attempt, generationId, result };
}

describe("site-scoped integration foundations", () => {
  it("keeps one current workflow state and joins concurrent attempts", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "single-flight");
    const [first, second] = await Promise.all([
      t.mutation(internal.integrations.begin, {
        siteId,
        workflow: "netbox",
        attemptId: "attempt:single:a",
        leaseId: "lease:single:a",
        origin: "manual",
      }),
      t.mutation(internal.integrations.begin, {
        siteId,
        workflow: "netbox",
        attemptId: "attempt:single:b",
        leaseId: "lease:single:b",
        origin: "manual",
      }),
    ]);

    expect([first.joined, second.joined].sort()).toEqual([false, true]);
    expect(first.attemptId).toBe(second.attemptId);
    await t.run(async (ctx) => {
      expect(
        await ctx.db.query("integrationWorkflowStates").collect(),
      ).toHaveLength(2);
      expect(await ctx.db.query("integrationAttempts").collect()).toHaveLength(
        1,
      );
    });
  });

  it("publishes immutable NetBox generations and preserves the last success", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "alpha");
    const first = await publishNetBox(t, siteId, "alpha-a");

    const nextAttempt = await begin(t, siteId, "netbox");
    let state = await t.query(api.integrations.getState, {
      siteId,
      workflow: "netbox",
    });
    expect(state).toMatchObject({
      status: "running",
      lastPublishedId: first.generationId,
      lastPrimaryCount: 3,
    });

    await t.mutation(internal.integrations.fail, {
      siteId,
      workflow: "netbox",
      attemptId: nextAttempt.attemptId,
      leaseId: nextAttempt.leaseId,
      fence: nextAttempt.fence,
      publicError: "Échec public",
    });
    state = await t.query(api.integrations.getState, {
      siteId,
      workflow: "netbox",
    });
    expect(state).toMatchObject({
      status: "error",
      lastPublishedId: first.generationId,
      lastPrimaryCount: 3,
      publicError: "Échec public",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("netboxGenerations").collect()).toHaveLength(1);
      expect(await ctx.db.query("netboxInventory").collect()).toHaveLength(3);
    });
  });

  it("isolates identical external IDs between two sites and their queries", async () => {
    const t = convexTest(schema, modules);
    const siteA = await createSite(t, "a");
    const siteB = await createSite(t, "b");
    await publishNetBox(t, siteA, "a");
    await publishNetBox(t, siteB, "b");
    const buildingId = await t.mutation(api.buildings.create, {
      siteId: siteA,
      objectId: "building:a",
      name: "A",
    });
    const floorId = await t.mutation(api.floors.create, {
      buildingId,
      objectId: "floor:a",
      name: "A",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("externalObjectBindings", {
        siteId: siteA,
        provider: "netbox",
        instanceKey: "netbox:a",
        externalId: "device:pc",
        deviceId: "device:placed",
        floorId,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const [inventoryA, inventoryB, connectionsA] = await Promise.all([
      t.query(api.netbox.listInventory, { siteId: siteA }),
      t.query(api.netbox.listInventory, { siteId: siteB }),
      t.query(api.netbox.listConnections, {
        siteId: siteA,
        externalId: "device:switch",
      }),
    ]);
    expect(inventoryA.map((item) => item.name)).toContain("PC a");
    expect(inventoryA.map((item) => item.name)).not.toContain("PC b");
    expect(inventoryB.map((item) => item.name)).toContain("PC b");
    expect(
      inventoryA.find((item) => item.externalId === "device:pc")?.placement,
    ).toEqual({ deviceId: "device:placed", floorId });
    expect(
      inventoryB.find((item) => item.externalId === "device:pc")?.placement,
    ).toBeUndefined();
    expect(connectionsA).toHaveLength(1);
    expect(inventoryA.every((item) => !Object.hasOwn(item, "macs"))).toBe(true);
    expect(inventoryB.every((item) => !Object.hasOwn(item, "macs"))).toBe(true);
  });

  it("rejects a NetBox payload carrying another site identity", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "identity");
    const attempt = await begin(t, siteId, "netbox");

    await expect(
      t.mutation(internal.netboxModel.publishGeneration, {
        siteId,
        attemptId: attempt.attemptId,
        leaseId: attempt.leaseId,
        fence: attempt.fence,
        generationId: "generation:wrong-site",
        instanceKey: "netbox:identity",
        externalSiteId: "another-site",
        externalSiteSlug: "identity",
        capturedAt: 1,
        ...snapshot("wrong"),
      }),
    ).rejects.toThrow("another site");

    await t.run(async (ctx) => {
      expect(await ctx.db.query("netboxGenerations").collect()).toHaveLength(0);
      expect(await ctx.db.query("netboxInventory").collect()).toHaveLength(0);
    });
  });

  it("pins one NetBox generation while a newer generation is published", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "pin");
    const first = await publishNetBox(t, siteId, "pin-a");
    const localization = await begin(t, siteId, "localization");
    expect(localization.pinnedNetBoxGenerationId).toBe(first.generationId);

    const second = await publishNetBox(t, siteId, "pin-b");
    expect(second.generationId).not.toBe(first.generationId);
    const result = await t.mutation(internal.librenmsModel.publishSnapshot, {
      siteId,
      attemptId: localization.attemptId,
      leaseId: localization.leaseId,
      fence: localization.fence,
      snapshotId: "snapshot:pin",
      netboxGenerationId: first.generationId,
      libreNmsInstanceKey: "librenms-main",
      capturedAt: 100,
      switchResults: [
        {
          externalId: "4",
          status: "success",
          observationCount: 1,
          rawFdbCount: 1,
          freshFdbCount: 1,
          staleFdbCount: 0,
          triggerStartedAt: Date.parse("2026-07-17T09:59:00Z"),
          discoveryCompletedAt: Date.parse("2026-07-17T10:00:00Z"),
          serverObservedAt: Date.parse("2026-07-17T10:01:00Z"),
        },
      ],
      diagnostics: [],
      observations: [
        {
          externalId: "fdb:1",
          kind: "fdb",
          libreNmsDeviceId: "4",
          portId: 10,
          portName: "Gi1/0/1",
          macAddress: "AABBCCDDEEFF",
          sourceObservedAt: "2026-07-17T10:00:00Z",
          fetchedAt: 100,
        },
      ],
      discoveries: [
        {
          externalId: "discovery:1",
          computerExternalId: "device:pc",
          socketExternalId: "device:socket",
          switchExternalId: "device:switch",
          switchPort: "Gi1/0/1",
          computerMac: "AABBCCDDEEFF",
          method: "fdb",
          confidence: "high",
          observedAt: 100,
          cablePathExternalIds: ["cable:1"],
        },
      ],
    });
    expect(result.snapshotId).toBe("snapshot:pin");
    await t.run(async (ctx) => {
      const snapshotRow = await ctx.db.query("localizationSnapshots").first();
      expect(snapshotRow?.netboxGenerationId).toBe(first.generationId);
      expect(await ctx.db.query("netboxGenerations").collect()).toHaveLength(2);
      const location = await ctx.db.query("computerLocations").unique();
      expect(location).toMatchObject({
        state: "resolved_unplaced",
        socketExternalId: "device:socket",
        projectionStatus: "idle",
      });
      expect(location?.reason).toBeUndefined();
    });
  });

  it("rejects empty and strongly incomplete generations without moving the pointer", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "guards");
    const first = await publishNetBox(t, siteId, "guards-a");
    const attempt = await begin(t, siteId, "netbox");
    const base = {
      siteId,
      attemptId: attempt.attemptId,
      leaseId: attempt.leaseId,
      fence: attempt.fence,
      generationId: "generation:empty",
      instanceKey: "netbox:guards",
      externalSiteId: "netbox-site:guards",
      externalSiteSlug: "guards",
      capturedAt: 2,
      inventory: [],
      connections: [],
    };
    await expect(
      t.mutation(internal.netboxModel.publishGeneration, base),
    ).rejects.toThrow("cannot be empty");
    await expect(
      t.mutation(internal.netboxModel.publishGeneration, {
        ...base,
        generationId: "generation:incomplete",
        inventory: [snapshot("incomplete").inventory[0]],
      }),
    ).rejects.toThrow("strongly incomplete");

    const state = await t.query(api.integrations.getState, {
      siteId,
      workflow: "netbox",
    });
    expect(state?.lastPublishedId).toBe(first.generationId);
  });

  it("abandons an expired attempt and fences its delayed worker", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "recovery");
    const oldAttempt = await begin(t, siteId, "netbox");
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "netbox")
            .eq("attemptId", oldAttempt.attemptId),
        )
        .unique();
      if (!row) throw new Error("Missing attempt");
      await ctx.db.patch(row._id, { leaseExpiresAt: 0 });
    });

    const replacement = await begin(t, siteId, "netbox");
    expect(replacement.fence).toBe(oldAttempt.fence + 1);
    await expect(
      t.mutation(internal.integrations.heartbeat, {
        siteId,
        workflow: "netbox",
        attemptId: oldAttempt.attemptId,
        leaseId: oldAttempt.leaseId,
        fence: oldAttempt.fence,
      }),
    ).rejects.toThrow("replaced");
    await expect(
      t.mutation(internal.netboxModel.publishGeneration, {
        siteId,
        attemptId: oldAttempt.attemptId,
        leaseId: oldAttempt.leaseId,
        fence: oldAttempt.fence,
        generationId: "generation:stale-worker",
        instanceKey: "netbox:recovery",
        externalSiteId: "netbox-site:recovery",
        externalSiteSlug: "recovery",
        capturedAt: 1,
        ...snapshot("stale"),
      }),
    ).rejects.toThrow("replaced");

    await t.run(async (ctx) => {
      const old = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "netbox")
            .eq("attemptId", oldAttempt.attemptId),
        )
        .unique();
      expect(old).toMatchObject({
        status: "abandoned",
        supersededByAttemptId: replacement.attemptId,
      });
      expect(await ctx.db.query("netboxGenerations").collect()).toHaveLength(0);
    });
  });

  it("retains unconfigured-switch evidence without resolving a position", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "foreign-switch");
    const generation = await publishNetBox(t, siteId, "foreign-switch");
    const localization = await begin(t, siteId, "localization");

    const observedAt = "2026-07-20T10:00:00Z";
    await t.mutation(internal.librenmsModel.publishSnapshot, {
      siteId,
      attemptId: localization.attemptId,
      leaseId: localization.leaseId,
      fence: localization.fence,
      snapshotId: "snapshot:foreign-switch",
      netboxGenerationId: generation.generationId,
      libreNmsInstanceKey: "librenms-main",
      capturedAt: Date.parse(observedAt),
      switchResults: [emptySwitchResult()],
      diagnostics: [
        {
          externalId: "librenms:diagnostic:0:device:pc",
          reason: "switch_absent_from_site_configuration",
          authoritative: false,
          computerExternalId: "device:pc",
          computerMac: "AABBCCDDEEFF",
          libreNmsDeviceId: "999",
          portId: 1,
          switchPort: "gi1/0/1",
          observedAt: Date.parse(observedAt),
        },
      ],
      observations: [
        {
          externalId: "fdb:foreign",
          kind: "fdb",
          libreNmsDeviceId: "999",
          portId: 1,
          portName: "Gi1/0/1",
          macAddress: "AA:BB:CC:DD:EE:FF",
          sourceObservedAt: observedAt,
          fetchedAt: Date.parse(observedAt),
        },
      ],
      discoveries: [],
    });
    await t.run(async (ctx) => {
      expect(
        await ctx.db.query("localizationSnapshots").collect(),
      ).toHaveLength(1);
      expect(
        await ctx.db.query("localizationDiagnostics").unique(),
      ).toMatchObject({
        reason: "switch_absent_from_site_configuration",
        authoritative: false,
        computerExternalId: "device:pc",
      });
      expect(await ctx.db.query("localizationLinks").collect()).toHaveLength(0);
      expect(await ctx.db.query("computerLocations").unique()).toMatchObject({
        state: "missing",
      });
    });
  });

  it("rejects a localization link without a supporting observation", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "unsupported-link");
    const generation = await publishNetBox(t, siteId, "unsupported-link");
    const localization = await begin(t, siteId, "localization");

    await expect(
      t.mutation(internal.librenmsModel.publishSnapshot, {
        siteId,
        attemptId: localization.attemptId,
        leaseId: localization.leaseId,
        fence: localization.fence,
        snapshotId: "snapshot:unsupported-link",
        netboxGenerationId: generation.generationId,
        libreNmsInstanceKey: "librenms-main",
        capturedAt: 1,
        switchResults: [emptySwitchResult()],
        diagnostics: [],
        observations: [],
        discoveries: [
          {
            externalId: "discovery:unsupported",
            computerExternalId: "device:pc",
            socketExternalId: "device:socket",
            switchExternalId: "device:switch",
            switchPort: "Gi1/0/1",
            computerMac: "AABBCCDDEEFF",
            method: "fdb",
            confidence: "high",
            observedAt: 1,
            cablePathExternalIds: ["cable:1"],
          },
        ],
      }),
    ).rejects.toThrow("supporting network observation");
  });

  it("publishes an explicit reason for a fresh MAC on an unknown NetBox port", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "unknown-port");
    const generation = await publishNetBox(t, siteId, "unknown-port");
    const localization = await begin(t, siteId, "localization");
    const observedAt = "2026-07-20T10:00:00Z";
    const observedTimestamp = Date.parse(observedAt);

    await t.mutation(internal.librenmsModel.publishSnapshot, {
      siteId,
      attemptId: localization.attemptId,
      leaseId: localization.leaseId,
      fence: localization.fence,
      snapshotId: "snapshot:unknown-port",
      netboxGenerationId: generation.generationId,
      libreNmsInstanceKey: "librenms-main",
      capturedAt: observedTimestamp,
      switchResults: [
        {
          externalId: "4",
          status: "success",
          observationCount: 1,
          rawFdbCount: 1,
          freshFdbCount: 1,
          staleFdbCount: 0,
          triggerStartedAt: observedTimestamp - 60_000,
          discoveryCompletedAt: observedTimestamp,
          serverObservedAt: observedTimestamp + 1_000,
        },
      ],
      diagnostics: [
        {
          externalId: "librenms:diagnostic:0:device:pc",
          reason: "unknown_switch_port_in_netbox",
          authoritative: true,
          computerExternalId: "device:pc",
          computerMac: "AABBCCDDEEFF",
          libreNmsDeviceId: "4",
          portId: 20,
          switchPort: "gi1/0/2",
          observedAt: observedTimestamp,
        },
      ],
      observations: [
        {
          externalId: "fdb:unknown-port",
          kind: "fdb",
          libreNmsDeviceId: "4",
          portId: 20,
          portName: "Gi1/0/2",
          macAddress: "AA:BB:CC:DD:EE:FF",
          sourceObservedAt: observedAt,
          fetchedAt: observedTimestamp,
        },
      ],
      discoveries: [],
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("computerLocations").unique()).toMatchObject({
        state: "unresolvable",
        reason: "unknown_switch_port_in_netbox",
        decidingMac: "AABBCCDDEEFF",
      });
      expect(
        await ctx.db.query("localizationDiagnostics").unique(),
      ).toMatchObject({
        reason: "unknown_switch_port_in_netbox",
        authoritative: true,
      });
    });
  });

  it("publishes patch-panel and uncabled-socket diagnostics from pinned NetBox evidence", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "patch-diagnostics");
    const netbox = snapshot("patch-diagnostics");
    const generation = await publishNetBox(t, siteId, "patch-diagnostics", {
      inventory: netbox.inventory.map((item) =>
        item.externalId === "device:socket"
          ? { ...item, cabledTerminationCount: 0 }
          : item,
      ),
      connections: [
        {
          externalId: "cable:patch-switch",
          fromExternalId: "device:switch",
          fromPort: "Gi1/0/1",
          fromTerminationExternalId: "dcim.interface:switch",
          fromTerminationKind: "interface" as const,
          fromPeerTerminationExternalIds: [],
          toExternalId: "device:patch-panel",
          toPort: "Rear 1",
          toTerminationExternalId: "dcim.rearport:1",
          toTerminationKind: "rear-port" as const,
          toPeerTerminationExternalIds: ["dcim.frontport:1"],
        },
      ],
    });
    const localization = await begin(t, siteId, "localization");
    const observedAt = "2026-07-20T10:00:00Z";
    const timestamp = Date.parse(observedAt);

    await t.mutation(internal.librenmsModel.publishSnapshot, {
      siteId,
      attemptId: localization.attemptId,
      leaseId: localization.leaseId,
      fence: localization.fence,
      snapshotId: "snapshot:patch-diagnostics",
      netboxGenerationId: generation.generationId,
      libreNmsInstanceKey: "librenms-main",
      capturedAt: timestamp,
      switchResults: [
        {
          externalId: "4",
          status: "success",
          observationCount: 1,
          rawFdbCount: 1,
          freshFdbCount: 1,
          staleFdbCount: 0,
          triggerStartedAt: timestamp - 60_000,
          discoveryCompletedAt: timestamp,
          serverObservedAt: timestamp + 1_000,
        },
      ],
      diagnostics: [
        {
          externalId: "netbox:device:socket:socket-without-cable",
          reason: "socket_without_cable",
          authoritative: false,
          socketExternalId: "device:socket",
        },
        {
          externalId: "librenms:diagnostic:0:device:pc",
          reason: "incomplete_patch_panel_path",
          authoritative: true,
          computerExternalId: "device:pc",
          computerMac: "AABBCCDDEEFF",
          libreNmsDeviceId: "4",
          portId: 10,
          switchPort: "gi1/0/1",
          observedAt: timestamp,
        },
      ],
      observations: [
        {
          externalId: "fdb:patch-diagnostics",
          kind: "fdb",
          libreNmsDeviceId: "4",
          portId: 10,
          portName: "Gi1/0/1",
          macAddress: "AA:BB:CC:DD:EE:FF",
          sourceObservedAt: observedAt,
          fetchedAt: timestamp,
        },
      ],
      discoveries: [],
    });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("computerLocations").unique()).toMatchObject({
        state: "unresolvable",
        reason: "incomplete_patch_panel_path",
      });
      expect(
        (await ctx.db.query("localizationDiagnostics").collect()).map(
          (diagnostic) => diagnostic.reason,
        ),
      ).toEqual(["socket_without_cable", "incomplete_patch_panel_path"]);
    });
  });

  it("publishes conflicting MAC inventory for every affected computer", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "mac-conflict");
    const netbox = snapshot("mac-conflict");
    const generation = await publishNetBox(t, siteId, "mac-conflict", {
      ...netbox,
      inventory: [
        ...netbox.inventory,
        {
          ...netbox.inventory[0],
          externalId: "device:pc-duplicate",
          name: "Duplicate PC",
          url: "https://netbox.example/mac-conflict/duplicate",
        },
      ],
    });
    const localization = await begin(t, siteId, "localization");
    const observedAt = "2026-07-20T10:00:00Z";
    const timestamp = Date.parse(observedAt);
    const diagnostics = ["device:pc", "device:pc-duplicate"].map(
      (computerExternalId) => ({
        externalId: `librenms:diagnostic:0:${computerExternalId}`,
        reason: "conflicting_mac_inventory" as const,
        authoritative: true,
        computerExternalId,
        computerMac: "AABBCCDDEEFF",
        libreNmsDeviceId: "4",
        portId: 10,
        observedAt: timestamp,
      }),
    );

    await t.mutation(internal.librenmsModel.publishSnapshot, {
      siteId,
      attemptId: localization.attemptId,
      leaseId: localization.leaseId,
      fence: localization.fence,
      snapshotId: "snapshot:mac-conflict",
      netboxGenerationId: generation.generationId,
      libreNmsInstanceKey: "librenms-main",
      capturedAt: timestamp,
      switchResults: [
        {
          externalId: "4",
          status: "success",
          observationCount: 1,
          rawFdbCount: 1,
          freshFdbCount: 1,
          staleFdbCount: 0,
          triggerStartedAt: timestamp - 60_000,
          discoveryCompletedAt: timestamp,
          serverObservedAt: timestamp + 1_000,
        },
      ],
      diagnostics,
      observations: [
        {
          externalId: "fdb:mac-conflict",
          kind: "fdb",
          libreNmsDeviceId: "4",
          portId: 10,
          portName: "Gi1/0/1",
          macAddress: "AA:BB:CC:DD:EE:FF",
          sourceObservedAt: observedAt,
          fetchedAt: timestamp,
        },
      ],
      discoveries: [],
    });

    await t.run(async (ctx) => {
      const locations = await ctx.db.query("computerLocations").collect();
      expect(locations).toHaveLength(2);
      expect(locations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            computerExternalId: "device:pc",
            state: "unresolvable",
            reason: "conflicting_mac_inventory",
          }),
          expect.objectContaining({
            computerExternalId: "device:pc-duplicate",
            state: "unresolvable",
            reason: "conflicting_mac_inventory",
          }),
        ]),
      );
    });
  });

  it("publishes explicit resolved, missing, and offline computer states", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSite(t, "computer-states");
    const generation = await publishNetBox(t, siteId, "computer-states");
    await t.run(async (ctx) => {
      await ctx.db.insert("devices", {
        objectId: "map:socket",
        floorId: "floor:1",
        type: "wall-port",
        name: "Socket",
        position: { x: 400, y: 400 },
        size: { width: 40, height: 40 },
        metadata: {},
        updatedAt: 1,
        updatedBy: "test",
      });
      await ctx.db.insert("externalObjectBindings", {
        siteId,
        provider: "netbox",
        instanceKey: "netbox:computer-states",
        externalId: "device:socket",
        deviceId: "map:socket",
        floorId: "floor:1",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const publishCycle = async (
      suffix: string,
      present: boolean,
      observedAt: string,
      overrides: {
        rawFdbCount?: number;
        freshFdbCount?: number;
        staleFdbCount?: number;
        fdbConfirmation?: {
          serverObservedAt: number;
          rows: Array<{
            deviceId: string;
            portId: number;
            macAddress: string;
            updatedAt: string;
          }>;
        };
      } = {},
    ) => {
      const localization = await begin(t, siteId, "localization");
      const observedTimestamp = Date.parse(observedAt);
      await t.mutation(internal.librenmsModel.publishSnapshot, {
        siteId,
        attemptId: localization.attemptId,
        leaseId: localization.leaseId,
        fence: localization.fence,
        snapshotId: `snapshot:${suffix}`,
        netboxGenerationId: generation.generationId,
        libreNmsInstanceKey: "librenms-main",
        capturedAt: observedTimestamp,
        switchResults: [
          {
            externalId: "4",
            status: "success",
            observationCount: present ? 1 : 0,
            rawFdbCount: overrides.rawFdbCount ?? (present ? 1 : 0),
            freshFdbCount: overrides.freshFdbCount ?? (present ? 1 : 0),
            staleFdbCount: overrides.staleFdbCount ?? 0,
            fdbConfirmation:
              overrides.fdbConfirmation ??
              (present
                ? undefined
                : { serverObservedAt: observedTimestamp + 1_000, rows: [] }),
            triggerStartedAt: observedTimestamp - 60_000,
            discoveryCompletedAt: observedTimestamp,
            serverObservedAt: observedTimestamp + 1_000,
          },
        ],
        diagnostics: [],
        observations: present
          ? [
              {
                externalId: `fdb:${suffix}`,
                kind: "fdb",
                libreNmsDeviceId: "4",
                portId: 10,
                portName: "Gi1/0/1",
                macAddress: "AABBCCDDEEFF",
                sourceObservedAt: observedAt,
                fetchedAt: observedTimestamp,
              },
            ]
          : [],
        discoveries: present
          ? [
              {
                externalId: `discovery:${suffix}`,
                computerExternalId: "device:pc",
                socketExternalId: "device:socket",
                switchExternalId: "device:switch",
                switchPort: "Gi1/0/1",
                computerMac: "AABBCCDDEEFF",
                method: "fdb",
                confidence: "high",
                observedAt: observedTimestamp,
                cablePathExternalIds: ["cable:1"],
              },
            ]
          : [],
      });
    };

    await publishCycle("present", true, "2026-07-20T10:00:00Z");
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("computerLocations")
            .withIndex("by_site_computer", (q) =>
              q.eq("siteId", siteId).eq("computerExternalId", "device:pc"),
            )
            .unique(),
      ),
    ).toMatchObject({
      state: "online",
      socketExternalId: "device:socket",
      consecutiveAbsences: 0,
      decidingMac: "AABBCCDDEEFF",
      observationUpdatedAt: Date.parse("2026-07-20T10:00:00Z"),
      projectionStatus: "pending",
    });
    expect(
      await t.query(api.librenms.listDiscoveredConnections, { siteId }),
    ).toHaveLength(1);
    expect(
      await t.run(
        async (ctx) => await ctx.db.query("computerProjections").unique(),
      ),
    ).toMatchObject({
      computerExternalId: "device:pc",
      socketExternalId: "device:socket",
      socketDeviceId: "map:socket",
      targetFloorId: "floor:1",
      state: "pending",
    });
    await t.run(async (ctx) => {
      const location = await ctx.db
        .query("computerLocations")
        .withIndex("by_site_computer", (q) =>
          q.eq("siteId", siteId).eq("computerExternalId", "device:pc"),
        )
        .unique();
      if (!location) throw new Error("Missing computer location");
      await ctx.db.patch(location._id, { projectionStatus: "success" });
      const published = await ctx.db.query("localizationSnapshots").first();
      if (!published) throw new Error("Missing localization snapshot");
      // Force the next one-row snapshot onto the 20% confirmation path.
      await ctx.db.patch(published._id, {
        switchResults: published.switchResults.map((result) => ({
          ...result,
          freshFdbCount: 5,
        })),
      });
    });

    await expect(
      publishCycle("same-count-different-row", true, "2026-07-20T10:03:00Z", {
        fdbConfirmation: {
          serverObservedAt: Date.parse("2026-07-20T10:03:01Z"),
          rows: [
            {
              deviceId: "4",
              portId: 11,
              macAddress: "001122334455",
              updatedAt: "2026-07-20T10:03:00Z",
            },
          ],
        },
      }),
    ).rejects.toThrow("stable confirmation");
    expect(
      await t.run(
        async (ctx) => await ctx.db.query("computerLocations").first(),
      ),
    ).toMatchObject({ state: "online", consecutiveAbsences: 0 });

    await publishCycle("identical-targeted-row", true, "2026-07-20T10:03:00Z", {
      fdbConfirmation: {
        serverObservedAt: Date.parse("2026-07-20T10:03:01Z"),
        rows: [
          {
            deviceId: "4",
            portId: 10,
            macAddress: "aa:bb:cc:dd:ee:ff",
            updatedAt: "2026-07-20T12:03:00+02:00",
          },
        ],
      },
    });

    await expect(
      publishCycle("bad-count", false, "2026-07-20T10:04:00Z", {
        rawFdbCount: 1,
        freshFdbCount: 1,
      }),
    ).rejects.toThrow("freshness counts");
    await expect(
      publishCycle("quarantined", false, "2026-07-20T10:05:00Z", {
        fdbConfirmation: {
          serverObservedAt: Date.parse("2026-07-20T10:05:01Z"),
          rows: [
            {
              deviceId: "4",
              portId: 10,
              macAddress: "AABBCCDDEEFF",
              updatedAt: "2026-07-20T10:05:00Z",
            },
          ],
        },
      }),
    ).rejects.toThrow("stable confirmation");
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("computerLocations")
            .withIndex("by_site_computer", (q) =>
              q.eq("siteId", siteId).eq("computerExternalId", "device:pc"),
            )
            .unique(),
      ),
    ).toMatchObject({
      state: "online",
      consecutiveAbsences: 0,
      projectionStatus: "pending",
    });

    await publishCycle("missing", false, "2026-07-20T10:05:00Z");
    expect(
      await t.run(
        async (ctx) => await ctx.db.query("computerLocations").first(),
      ),
    ).toMatchObject({
      state: "missing",
      consecutiveAbsences: 1,
      projectionStatus: "idle",
      observationUpdatedAt: Date.parse("2026-07-20T10:03:00Z"),
    });
    expect(
      await t.query(api.librenms.listDiscoveredConnections, { siteId }),
    ).toEqual([]);
    expect(
      await t.run(
        async (ctx) => await ctx.db.query("computerProjections").first(),
      ),
    ).toBeNull();

    await publishCycle("returned", true, "2026-07-20T10:10:00Z");
    expect(
      await t.run(
        async (ctx) => await ctx.db.query("computerLocations").first(),
      ),
    ).toMatchObject({
      state: "online",
      consecutiveAbsences: 0,
      decidingMac: "AABBCCDDEEFF",
      observationUpdatedAt: Date.parse("2026-07-20T10:10:00Z"),
      projectionStatus: "pending",
    });
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.query("localizationEvents").collect()).map(
          (event) => event.kind,
        ),
      ),
    ).toContain("returned");

    await t.run(async (ctx) => {
      const location = await ctx.db.query("computerLocations").first();
      if (!location) throw new Error("Missing computer location");
      await ctx.db.patch(location._id, { state: "ambiguous" });
    });
    expect(
      await t.query(api.librenms.listDiscoveredConnections, { siteId }),
    ).toEqual([]);
    await t.run(async (ctx) => {
      const location = await ctx.db.query("computerLocations").first();
      if (!location) throw new Error("Missing computer location");
      await ctx.db.patch(location._id, { state: "socket_conflict" });
    });
    expect(
      await t.query(api.librenms.listDiscoveredConnections, { siteId }),
    ).toEqual([]);

    await publishCycle("missing-again", false, "2026-07-20T10:15:00Z");
    await publishCycle("offline", false, "2026-07-20T10:20:00Z");
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("computerLocations")
            .withIndex("by_site_computer", (q) =>
              q.eq("siteId", siteId).eq("computerExternalId", "device:pc"),
            )
            .unique(),
      ),
    ).toMatchObject({
      state: "offline",
      consecutiveAbsences: 2,
      lastConfirmedSocketExternalId: "device:socket",
    });
  });
});
