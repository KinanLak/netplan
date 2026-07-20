import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import { modules } from "./_test/modules";
import schema from "./schema";

let sequence = 0;

const emptySwitchResult = (externalId: string) => ({
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

const siteInput = (key: string, enabled = true) => ({
  objectId: `site:${key}`,
  configKey: key,
  displayName: key,
  timezone: "Europe/Paris",
  enabled,
  dayStartMinute: 420,
  dayEndMinute: 1200,
  netboxInstanceKey: `netbox:${key}`,
  netboxExternalSiteId: key,
  netboxExternalSiteSlug: key,
  libreNmsInstanceKey: "librenms-main",
  libreNmsDevices: ["4", "5"].map((externalId) => ({
    externalId,
    hostname: `access-${externalId}-${key}`,
    networkName: `sw-access-${externalId}`,
    role: "access" as const,
    localizationTarget: true,
  })),
});

const netboxSnapshot = {
  inventory: [
    {
      externalId: "device:switch",
      type: "switch" as const,
      name: "sw-access-4",
      role: "Switch Access",
      locationPath: [],
      macs: [],
      interfaceCount: 48,
      cabledTerminationCount: 0,
      lifecycleStatus: "active",
      url: "https://netbox.example/switch",
    },
  ],
  connections: [],
};

const createSiteWithNetBox = async (
  t: ReturnType<typeof convexTest>,
  key: string,
) => {
  const site = siteInput(key);
  const siteId = await t.mutation(internal.sites.create, { site });
  sequence += 1;
  const attempt = await t.mutation(internal.integrations.begin, {
    siteId,
    workflow: "netbox",
    attemptId: `seed-attempt:${sequence}`,
    leaseId: `seed-lease:${sequence}`,
    origin: "manual",
  });
  await t.mutation(internal.netboxModel.publishGeneration, {
    siteId,
    attemptId: attempt.attemptId,
    leaseId: attempt.leaseId,
    fence: attempt.fence,
    generationId: `generation:${key}`,
    instanceKey: site.netboxInstanceKey,
    externalSiteId: site.netboxExternalSiteId,
    externalSiteSlug: site.netboxExternalSiteSlug,
    capturedAt: Date.now(),
    ...netboxSnapshot,
  });
  return siteId;
};

afterEach(() => {
  delete process.env.INTEGRATION_SCHEDULER_ENABLED;
  delete process.env.INTEGRATION_MANUAL_REFRESH_ENABLED;
});

beforeEach(() => {
  process.env.INTEGRATION_MANUAL_REFRESH_ENABLED = "true";
});

describe("integration orchestration", () => {
  it("reserves durable switch work while concurrent requests join", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "single-flight");
    const [first, second] = await Promise.all([
      t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId,
      }),
      t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId,
      }),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      "joined_existing",
      "started",
    ]);
    await t.run(async (ctx) => {
      const attempts = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_status", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("status", "running"),
        )
        .collect();
      const switches = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      expect(attempts).toHaveLength(1);
      expect(switches.map((state) => state.libreNmsDeviceId).sort()).toEqual([
        "4",
        "5",
      ]);
      expect(
        await ctx.db.system.query("_scheduled_functions").collect(),
      ).toHaveLength(0);
    });
  });

  it("keeps sites independent", async () => {
    const t = convexTest(schema, modules);
    const [siteA, siteB] = await Promise.all([
      createSiteWithNetBox(t, "a"),
      createSiteWithNetBox(t, "b"),
    ]);
    const [resultA, resultB] = await Promise.all([
      t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId: siteA,
      }),
      t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId: siteB,
      }),
    ]);
    expect(resultA.status).toBe("started");
    expect(resultB.status).toBe("started");
  });

  it("keeps manual network activity disabled behind the rollout switch", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "manual-disabled");
    delete process.env.INTEGRATION_MANUAL_REFRESH_ENABLED;
    expect(
      await t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId,
      }),
    ).toEqual({ status: "disabled" });
  });

  it("applies active, blocked, and recent-snapshot manual priorities", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "manual-policy");
    const started = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    expect(started.status).toBe("started");
    const joined = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    expect(joined.status).toBe("joined_existing");

    await t.run(async (ctx) => {
      const workflow = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", siteId).eq("workflow", "localization"),
        )
        .unique();
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", workflow?.activeAttemptId as string),
        )
        .unique();
      if (!workflow || !attempt) throw new Error("Missing active cycle");
      await ctx.db.patch(attempt._id, {
        status: "abandoned",
        completedAt: Date.now(),
      });
      await ctx.db.patch(workflow._id, {
        status: "success",
        activeAttemptId: undefined,
        activeOrigin: undefined,
        lastPublishedId: "snapshot:recent",
        lastPublishedAt: Date.now(),
      });
      const switchState = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) =>
          q.eq("siteId", siteId).eq("libreNmsDeviceId", "4"),
        )
        .unique();
      if (!switchState) throw new Error("Missing switch state");
      await ctx.db.patch(switchState._id, {
        status: "blocked",
        activeAttemptId: undefined,
      });
    });

    const blocked = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    expect(blocked).toMatchObject({
      status: "switch_blocked",
      libreNmsDeviceId: "4",
    });
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) =>
          q.eq("siteId", siteId).eq("libreNmsDeviceId", "4"),
        )
        .unique();
      if (state) await ctx.db.patch(state._id, { status: "error" });
    });
    const confirmation = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    expect(confirmation).toMatchObject({
      status: "confirmation_required",
      snapshotId: "snapshot:recent",
    });
    const confirmed = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId, confirmedSnapshotId: "snapshot:recent" },
    );
    expect(confirmed.status).toBe("started");
  });

  it("scans due workflows, ignores disabled sites, and skips active deadlines", async () => {
    process.env.INTEGRATION_SCHEDULER_ENABLED = "true";
    const t = convexTest(schema, modules);
    const dueSite = await createSiteWithNetBox(t, "due");
    await t.mutation(internal.sites.create, {
      site: siteInput("disabled", false),
    });
    await t.run(async (ctx) => {
      const states = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) => q.eq("siteId", dueSite))
        .collect();
      for (const state of states) {
        await ctx.db.patch(state._id, { nextScheduledAt: 1 });
      }
    });

    const result = await t.mutation(
      internal.integrationOrchestration.scanDue,
      {},
    );
    expect(result).toEqual({ started: 2, skipped: 0 });

    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", dueSite).eq("workflow", "localization"),
        )
        .unique();
      if (!state) throw new Error("Missing localization state");
      await ctx.db.patch(state._id, { nextScheduledAt: 1 });
    });
    const skipped = await t.mutation(
      internal.integrationOrchestration.scanDue,
      {},
    );
    expect(skipped.skipped).toBe(1);
  });

  it("lets a manual refresh override localization backoff", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "backoff");
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", siteId).eq("workflow", "localization"),
        )
        .unique();
      if (!state) throw new Error("Missing workflow state");
      await ctx.db.patch(state._id, {
        status: "backoff",
        backoffLevel: 3,
        backoffUntil: Date.now() + 30 * 60 * 1000,
        nextScheduledAt: Date.now() + 30 * 60 * 1000,
      });
    });
    expect(
      await t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId,
      }),
    ).toMatchObject({ status: "started" });
  });

  it("stages switch results immutably and rejects an incoherent capture window", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "staging");
    const started = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    if (started.status !== "started") throw new Error("Cycle did not start");
    const state = await t.run(async (ctx) => {
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", started.attemptId),
        )
        .unique();
      const switches = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      if (!attempt) throw new Error("Missing attempt");
      return { attempt, switches };
    });
    const firstCapture = Date.now();
    const stage = async (deviceId: string, capturedAt: number) => {
      const switchState = state.switches.find(
        (row) => row.libreNmsDeviceId === deviceId,
      );
      if (!switchState) throw new Error("Missing switch");
      return await t.mutation(internal.localizationOrchestration.stageResult, {
        siteId,
        attemptId: state.attempt.attemptId,
        leaseId: state.attempt.leaseId,
        fence: state.attempt.fence,
        libreNmsDeviceId: deviceId,
        switchFence: switchState.fence,
        attemptCount: 1,
        netboxGenerationId: state.attempt.pinnedNetBoxGenerationId as string,
        discoveryGeneration: `discovery:${deviceId}`,
        capturedAt,
        observations: [],
      });
    };

    await stage("4", firstCapture);
    await expect(stage("4", firstCapture + 1)).rejects.toThrow("immutable");
    await stage("5", firstCapture + 5 * 60 * 1000 + 1);

    await expect(
      t.mutation(internal.librenmsModel.publishSnapshot, {
        siteId,
        attemptId: state.attempt.attemptId,
        leaseId: state.attempt.leaseId,
        fence: state.attempt.fence,
        snapshotId: "snapshot:incoherent",
        netboxGenerationId: state.attempt.pinnedNetBoxGenerationId as string,
        libreNmsInstanceKey: "librenms-main",
        capturedAt: firstCapture,
        stagingRequired: true,
        switchResults: [
          {
            externalId: "4",
            status: "success",
            observationCount: 0,
            rawFdbCount: 0,
            freshFdbCount: 0,
            staleFdbCount: 0,
            triggerStartedAt: 0,
            discoveryCompletedAt: 0,
            serverObservedAt: 0,
            discoveryGeneration: "discovery:4",
            capturedAt: firstCapture,
          },
          {
            externalId: "5",
            status: "success",
            observationCount: 0,
            rawFdbCount: 0,
            freshFdbCount: 0,
            staleFdbCount: 0,
            triggerStartedAt: 0,
            discoveryCompletedAt: 0,
            serverObservedAt: 0,
            discoveryGeneration: "discovery:5",
            capturedAt: firstCapture + 5 * 60 * 1000 + 1,
          },
        ],
        observations: [],
        discoveries: [],
        diagnostics: [],
      }),
    ).rejects.toThrow("coherence window");
    await t.run(async (ctx) => {
      expect(
        await ctx.db.query("localizationSnapshots").collect(),
      ).toHaveLength(0);
    });
  });

  it("does not finalize staged results without agent freshness evidence", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "finalizer");
    const started = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    if (started.status !== "started") throw new Error("Cycle did not start");
    const state = await t.run(async (ctx) => {
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", started.attemptId),
        )
        .unique();
      const switches = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      if (!attempt?.pinnedNetBoxGenerationId)
        throw new Error("Missing attempt");
      return { attempt, switches };
    });
    const netboxGenerationId = state.attempt.pinnedNetBoxGenerationId;
    if (!netboxGenerationId) throw new Error("Missing pinned generation");
    const capturedAt = Date.now();
    for (const switchState of state.switches) {
      await t.mutation(internal.localizationOrchestration.stageResult, {
        siteId,
        attemptId: state.attempt.attemptId,
        leaseId: state.attempt.leaseId,
        fence: state.attempt.fence,
        libreNmsDeviceId: switchState.libreNmsDeviceId,
        switchFence: switchState.fence,
        attemptCount: 1,
        netboxGenerationId,
        discoveryGeneration: `discovery:${switchState.libreNmsDeviceId}`,
        capturedAt,
        observations: [],
      });
    }

    await t.run(async (ctx) => {
      expect(
        await ctx.db.query("localizationSnapshots").collect(),
      ).toHaveLength(0);
      expect(await ctx.db.query("localizationCycles").collect()).toHaveLength(
        0,
      );
      expect(
        await ctx.db.system.query("_scheduled_functions").collect(),
      ).toHaveLength(0);
    });
  });

  it("retries only the definitive failed switch and blocks uncertain work", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "switch-policy");
    const started = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    if (started.status !== "started") throw new Error("Cycle did not start");
    const current = await t.run(async (ctx) => {
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", started.attemptId),
        )
        .unique();
      const switches = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      if (!attempt) throw new Error("Missing attempt");
      return { attempt, switches };
    });
    const switch4 = current.switches.find(
      (state) => state.libreNmsDeviceId === "4",
    );
    const switch5 = current.switches.find(
      (state) => state.libreNmsDeviceId === "5",
    );
    if (!switch4 || !switch5) throw new Error("Missing switches");
    const worker = {
      siteId,
      attemptId: current.attempt.attemptId,
      leaseId: current.attempt.leaseId,
      fence: current.attempt.fence,
      libreNmsDeviceId: "4",
      switchFence: switch4.fence,
      attemptCount: 1,
    };
    await t.mutation(internal.localizationOrchestration.retryOrFail, {
      ...worker,
      publicError: "Trigger refusé",
      privateErrorCode: "trigger_refused",
    });
    await t.run(async (ctx) => {
      const states = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      expect(
        states.find((state) => state.libreNmsDeviceId === "4"),
      ).toMatchObject({
        status: "pending",
        attemptCount: 2,
        fence: switch4.fence + 1,
      });
      expect(
        states.find((state) => state.libreNmsDeviceId === "5"),
      ).toMatchObject({
        status: "pending",
        attemptCount: 1,
        fence: switch5.fence,
      });
    });

    const retried4 = {
      ...worker,
      switchFence: switch4.fence + 1,
      attemptCount: 2,
    };
    await t.mutation(internal.localizationOrchestration.markUncertain, {
      ...retried4,
      publicError: "Discovery expiré",
      privateErrorCode: "trigger_uncertain",
    });
    expect(
      await t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId,
      }),
    ).toMatchObject({ status: "switch_blocked", switchStatus: "uncertain" });
    await t.run(async (ctx) => {
      const switchState = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) =>
          q.eq("siteId", siteId).eq("libreNmsDeviceId", "4"),
        )
        .unique();
      if (!switchState) throw new Error("Missing switch");
      await ctx.db.patch(switchState._id, { uncertainDeadlineAt: 0 });
    });
    expect(
      await t.mutation(internal.localizationOrchestration.updateUncertain, {
        siteId,
        attemptId: current.attempt.attemptId,
        libreNmsDeviceId: "4",
        switchFence: switch4.fence + 1,
      }),
    ).toBe("blocked");
    expect(
      await t.query(api.integrations.getState, {
        siteId,
        workflow: "localization",
      }),
    ).toMatchObject({ status: "blocked" });
  });

  it("recovers an expired triggered worker as uncertain without retriggering", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "crash-recovery");
    const started = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    if (started.status !== "started") throw new Error("Cycle did not start");
    await t.run(async (ctx) => {
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", started.attemptId),
        )
        .unique();
      const switchStates = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      if (!attempt || switchStates.length !== 2) {
        throw new Error("Missing cycle state");
      }
      await ctx.db.patch(attempt._id, { leaseExpiresAt: 0 });
      for (const switchState of switchStates) {
        await ctx.db.patch(switchState._id, {
          status: "triggered",
          previousLastDiscovered: "2026-07-17 10:00:00",
          pollingDeadlineAt: Date.now(),
        });
      }
    });

    expect(
      await t.mutation(api.integrationOrchestration.requestManualLocalization, {
        siteId,
      }),
    ).toMatchObject({
      status: "switch_blocked",
      libreNmsDeviceId: "4",
      switchStatus: "uncertain",
    });
    await t.run(async (ctx) => {
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", started.attemptId),
        )
        .unique();
      const switchStates = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .collect();
      expect(attempt?.status).toBe("abandoned");
      expect(switchStates.map((state) => state.status)).toEqual([
        "uncertain",
        "uncertain",
      ]);
    });
  });

  it("restores the workflow when an uncertain switch eventually completes", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "uncertain-release");
    const started = await t.mutation(
      api.integrationOrchestration.requestManualLocalization,
      { siteId },
    );
    if (started.status !== "started") throw new Error("Cycle did not start");
    const current = await t.run(async (ctx) => {
      const attempt = await ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_attempt", (q) =>
          q
            .eq("siteId", siteId)
            .eq("workflow", "localization")
            .eq("attemptId", started.attemptId),
        )
        .unique();
      const switchState = await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) =>
          q.eq("siteId", siteId).eq("libreNmsDeviceId", "4"),
        )
        .unique();
      if (!attempt || !switchState) throw new Error("Missing cycle state");
      return { attempt, switchState };
    });
    await t.mutation(internal.localizationOrchestration.markUncertain, {
      siteId,
      attemptId: current.attempt.attemptId,
      leaseId: current.attempt.leaseId,
      fence: current.attempt.fence,
      libreNmsDeviceId: "4",
      switchFence: current.switchState.fence,
      attemptCount: 1,
      publicError: "Discovery expiré",
      privateErrorCode: "trigger_uncertain",
    });
    expect(
      await t.mutation(internal.localizationOrchestration.updateUncertain, {
        siteId,
        attemptId: current.attempt.attemptId,
        libreNmsDeviceId: "4",
        switchFence: current.switchState.fence,
        lastDiscovered: "2026-07-17 10:01:00",
      }),
    ).toBe("released");
    expect(
      await t.query(api.integrations.getState, {
        siteId,
        workflow: "localization",
      }),
    ).toMatchObject({
      status: "backoff",
      switchProgress: [
        { externalId: "4", status: "error" },
        { externalId: "5", status: "error" },
      ],
    });
  });

  it("progresses localization backoff and resets it after success", async () => {
    const t = convexTest(schema, modules);
    const siteId = await createSiteWithNetBox(t, "backoff-progression");
    for (let level = 1; level <= 4; level += 1) {
      const attempt = await t.mutation(internal.integrations.begin, {
        siteId,
        workflow: "localization",
        attemptId: `backoff-attempt:${level}`,
        leaseId: `backoff-lease:${level}`,
        origin: "manual",
      });
      await t.mutation(internal.integrations.fail, {
        siteId,
        workflow: "localization",
        attemptId: attempt.attemptId,
        leaseId: attempt.leaseId,
        fence: attempt.fence,
        publicError: "LibreNMS inaccessible",
      });
      expect(
        await t.query(api.integrations.getState, {
          siteId,
          workflow: "localization",
        }),
      ).toMatchObject({ status: "backoff", backoffLevel: level });
    }

    const success = await t.mutation(internal.integrations.begin, {
      siteId,
      workflow: "localization",
      attemptId: "backoff-success",
      leaseId: "backoff-success-lease",
      origin: "manual",
    });
    await t.mutation(internal.librenmsModel.publishSnapshot, {
      siteId,
      attemptId: success.attemptId,
      leaseId: success.leaseId,
      fence: success.fence,
      snapshotId: "snapshot:backoff-success",
      netboxGenerationId: success.pinnedNetBoxGenerationId as string,
      libreNmsInstanceKey: "librenms-main",
      capturedAt: Date.now(),
      switchResults: [emptySwitchResult("4"), emptySwitchResult("5")],
      observations: [],
      discoveries: [],
      diagnostics: [],
    });
    expect(
      await t.query(api.integrations.getState, {
        siteId,
        workflow: "localization",
      }),
    ).toMatchObject({
      status: "success",
      backoffLevel: 0,
      consecutiveFailures: 0,
    });
  });
});
