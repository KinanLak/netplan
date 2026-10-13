import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { libreNmsClientFromEnvironment, LibreNmsClientError } from "./librenms";
import { observationInput } from "./librenmsModel";
import { failWorkflowAttempt, requireOwnedAttempt } from "./integrationModel";

declare const process: { env: Record<string, string | undefined> };

const SWITCH_TIMEOUT_MS = 2 * 60 * 1000;
const UNCERTAIN_MONITOR_MS = 10 * 60 * 1000;
const POLL_INTERVAL_MS = 4_000;
const MONITOR_INTERVAL_MS = 15_000;
const scheduledDelayMs = (productionDelay: number): number =>
  process.env.NODE_ENV === "test" ? 24 * 60 * 60 * 1000 : productionDelay;

const workerArgs = {
  siteId: v.string(),
  attemptId: v.string(),
  leaseId: v.string(),
  fence: v.number(),
  libreNmsDeviceId: v.string(),
  switchFence: v.number(),
  attemptCount: v.number(),
};

type WorkerArgs = {
  siteId: string;
  attemptId: string;
  leaseId: string;
  fence: number;
  libreNmsDeviceId: string;
  switchFence: number;
  attemptCount: number;
};

const sleep = async (milliseconds: number) =>
  await new Promise((resolve) => setTimeout(resolve, milliseconds));

const privateDetail = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 500);

const libreNmsClient = (ctx: ActionCtx) =>
  libreNmsClientFromEnvironment(async (input, init) => {
    const url = new URL(String(input));
    const result = await ctx.runAction(internal.librenmsTransport.request, {
      path: `${url.pathname}${url.search}`,
      trigger: init?.cache === "no-store",
    });
    return new Response(result.body, {
      status: result.status,
      headers: result.location ? { Location: result.location } : undefined,
    });
  });

const requireSwitchLock = async (ctx: MutationCtx, args: WorkerArgs) => {
  const state = await ctx.db
    .query("switchRefreshStates")
    .withIndex("by_site_switch", (q) =>
      q.eq("siteId", args.siteId).eq("libreNmsDeviceId", args.libreNmsDeviceId),
    )
    .unique();
  if (
    !state ||
    state.activeAttemptId !== args.attemptId ||
    state.fence !== args.switchFence
  ) {
    throw new ConvexError("Switch refresh worker has been replaced");
  }
  return state;
};

const patchProgress = async (
  ctx: MutationCtx,
  siteId: string,
  externalId: string,
  status: Doc<"integrationWorkflowStates">["switchProgress"][number]["status"],
) => {
  const workflow = await ctx.db
    .query("integrationWorkflowStates")
    .withIndex("by_site_workflow", (q) =>
      q.eq("siteId", siteId).eq("workflow", "localization"),
    )
    .unique();
  if (!workflow) throw new Error("Localization workflow is missing");
  await ctx.db.patch(workflow._id, {
    switchProgress: workflow.switchProgress.map((item) =>
      item.externalId === externalId ? { ...item, status } : item,
    ),
  });
};

const releaseOtherSwitches = async (
  ctx: MutationCtx,
  siteId: string,
  attemptId: string,
  exceptDeviceId?: string,
) => {
  const states = await ctx.db
    .query("switchRefreshStates")
    .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
    .collect();
  for (const state of states) {
    if (
      state.activeAttemptId === attemptId &&
      state.libreNmsDeviceId !== exceptDeviceId &&
      state.status !== "uncertain" &&
      state.status !== "blocked"
    ) {
      await ctx.db.patch(state._id, {
        status: "error",
        activeAttemptId: undefined,
        completedAt: Date.now(),
        publicError: "Erreur interne",
        privateErrorCode: "cycle_closed",
      });
      await patchProgress(ctx, siteId, state.libreNmsDeviceId, "error");
    }
  }
};

export const recordBaseline = internalMutation({
  args: {
    ...workerArgs,
    previousLastDiscovered: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedAttempt(ctx, { ...args, workflow: "localization" });
    const state = await requireSwitchLock(ctx, args);
    const now = Date.now();
    await ctx.db.patch(state._id, {
      status: "refreshing",
      previousLastDiscovered: args.previousLastDiscovered,
      triggerStartedAt: now,
      pollingDeadlineAt: now + SWITCH_TIMEOUT_MS,
      publicError: undefined,
      privateErrorCode: undefined,
    });
    await patchProgress(ctx, args.siteId, args.libreNmsDeviceId, "refreshing");
    return null;
  },
});

export const recordTriggered = internalMutation({
  args: workerArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedAttempt(ctx, { ...args, workflow: "localization" });
    const state = await requireSwitchLock(ctx, args);
    await ctx.db.patch(state._id, {
      status: "triggered",
      triggerAcceptedAt: Date.now(),
    });
    await patchProgress(ctx, args.siteId, args.libreNmsDeviceId, "triggered");
    return null;
  },
});

export const stageResult = internalMutation({
  args: {
    ...workerArgs,
    netboxGenerationId: v.string(),
    discoveryGeneration: v.string(),
    previousLastDiscovered: v.optional(v.string()),
    capturedAt: v.number(),
    lastDiscoveredTimetaken: v.optional(v.number()),
    observations: v.array(observationInput),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { attempt } = await requireOwnedAttempt(ctx, {
      ...args,
      workflow: "localization",
    });
    if (attempt.pinnedNetBoxGenerationId !== args.netboxGenerationId) {
      throw new ConvexError("Staging used an unpinned NetBox generation");
    }
    const existing = await ctx.db
      .query("localizationSwitchResults")
      .withIndex("by_attempt_switch", (q) =>
        q
          .eq("siteId", args.siteId)
          .eq("attemptId", args.attemptId)
          .eq("libreNmsDeviceId", args.libreNmsDeviceId),
      )
      .unique();
    if (existing) {
      if (
        existing.netboxGenerationId !== args.netboxGenerationId ||
        existing.discoveryGeneration !== args.discoveryGeneration ||
        existing.capturedAt !== args.capturedAt ||
        existing.observationCount !== args.observations.length
      ) {
        throw new ConvexError("Staged switch result is immutable");
      }
      return existing.resultId;
    }
    const switchState = await requireSwitchLock(ctx, args);
    if (
      args.observations.some(
        (observation) => observation.libreNmsDeviceId !== args.libreNmsDeviceId,
      )
    ) {
      throw new ConvexError("Staged observation belongs to another switch");
    }
    const resultId = `switch-result:${args.attemptId}:${args.libreNmsDeviceId}`;
    await ctx.db.insert("localizationSwitchResults", {
      siteId: args.siteId,
      attemptId: args.attemptId,
      resultId,
      libreNmsDeviceId: args.libreNmsDeviceId,
      switchFence: args.switchFence,
      netboxGenerationId: args.netboxGenerationId,
      discoveryGeneration: args.discoveryGeneration,
      previousLastDiscovered: args.previousLastDiscovered,
      capturedAt: args.capturedAt,
      observationCount: args.observations.length,
      attemptCount: args.attemptCount,
      lastDiscoveredTimetaken: args.lastDiscoveredTimetaken,
    });
    for (const observation of args.observations) {
      await ctx.db.insert("localizationStagedObservations", {
        siteId: args.siteId,
        attemptId: args.attemptId,
        resultId,
        ...observation,
      });
    }
    const now = Date.now();
    await ctx.db.patch(switchState._id, {
      status: "success",
      activeAttemptId: undefined,
      completedAt: now,
      durationMs: switchState.startedAt
        ? now - switchState.startedAt
        : undefined,
      newLastDiscovered: args.discoveryGeneration,
      lastDiscoveredTimetaken: args.lastDiscoveredTimetaken,
      stagedResultId: resultId,
      stagedCapturedAt: args.capturedAt,
      freshFdbCount: args.observations.filter(
        (observation) => observation.kind === "fdb",
      ).length,
    });
    await patchProgress(ctx, args.siteId, args.libreNmsDeviceId, "success");

    return resultId;
  },
});

export const retryOrFail = internalMutation({
  args: {
    ...workerArgs,
    publicError: v.string(),
    privateErrorCode: v.string(),
    privateErrorDetail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedAttempt(ctx, { ...args, workflow: "localization" });
    const state = await requireSwitchLock(ctx, args);
    if (args.attemptCount < 2) {
      const switchFence = args.switchFence + 1;
      await ctx.db.patch(state._id, {
        status: "pending",
        fence: switchFence,
        attemptCount: args.attemptCount + 1,
        triggerStartedAt: undefined,
        triggerAcceptedAt: undefined,
        pollingDeadlineAt: undefined,
        previousLastDiscovered: undefined,
        privateErrorCode: args.privateErrorCode,
        publicError: args.publicError,
      });
      await patchProgress(ctx, args.siteId, args.libreNmsDeviceId, "pending");
      await ctx.scheduler.runAfter(
        scheduledDelayMs(1_000),
        internal.localizationOrchestration.runSwitch,
        {
          siteId: args.siteId,
          attemptId: args.attemptId,
          leaseId: args.leaseId,
          fence: args.fence,
          libreNmsDeviceId: args.libreNmsDeviceId,
          switchFence,
          attemptCount: args.attemptCount + 1,
        },
      );
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(state._id, {
      status: "error",
      activeAttemptId: undefined,
      completedAt: now,
      durationMs: state.startedAt ? now - state.startedAt : undefined,
      privateErrorCode: args.privateErrorCode,
      publicError: args.publicError,
    });
    await patchProgress(ctx, args.siteId, args.libreNmsDeviceId, "error");
    await failWorkflowAttempt(ctx, {
      ...args,
      workflow: "localization",
    });
    await releaseOtherSwitches(ctx, args.siteId, args.attemptId);
    return null;
  },
});

export const markUncertain = internalMutation({
  args: {
    ...workerArgs,
    publicError: v.string(),
    privateErrorCode: v.string(),
    privateErrorDetail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOwnedAttempt(ctx, { ...args, workflow: "localization" });
    const state = await requireSwitchLock(ctx, args);
    const uncertainDeadlineAt = Date.now() + UNCERTAIN_MONITOR_MS;
    await ctx.db.patch(state._id, {
      status: "uncertain",
      uncertainDeadlineAt,
      leaseExpiresAt: uncertainDeadlineAt,
      privateErrorCode: args.privateErrorCode,
      publicError: args.publicError,
    });
    await patchProgress(ctx, args.siteId, args.libreNmsDeviceId, "uncertain");
    await failWorkflowAttempt(ctx, {
      ...args,
      workflow: "localization",
    });
    await releaseOtherSwitches(
      ctx,
      args.siteId,
      args.attemptId,
      args.libreNmsDeviceId,
    );
    await ctx.scheduler.runAfter(
      scheduledDelayMs(MONITOR_INTERVAL_MS),
      internal.localizationOrchestration.monitorUncertain,
      {
        siteId: args.siteId,
        attemptId: args.attemptId,
        libreNmsDeviceId: args.libreNmsDeviceId,
        switchFence: args.switchFence,
      },
    );
    return null;
  },
});

export const updateUncertain = internalMutation({
  args: {
    siteId: v.string(),
    attemptId: v.string(),
    libreNmsDeviceId: v.string(),
    switchFence: v.number(),
    lastDiscovered: v.optional(v.string()),
  },
  returns: v.union(
    v.literal("released"),
    v.literal("monitoring"),
    v.literal("blocked"),
    v.literal("stale"),
  ),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("switchRefreshStates")
      .withIndex("by_site_switch", (q) =>
        q
          .eq("siteId", args.siteId)
          .eq("libreNmsDeviceId", args.libreNmsDeviceId),
      )
      .unique();
    if (
      !state ||
      state.activeAttemptId !== args.attemptId ||
      state.fence !== args.switchFence ||
      state.status !== "uncertain"
    ) {
      return "stale";
    }
    if (
      args.lastDiscovered &&
      args.lastDiscovered !== state.previousLastDiscovered
    ) {
      await ctx.db.patch(state._id, {
        status: "error",
        activeAttemptId: undefined,
        completedAt: Date.now(),
        newLastDiscovered: args.lastDiscovered,
        publicError: "Discovery expiré",
      });
      const workflow = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", args.siteId).eq("workflow", "localization"),
        )
        .unique();
      if (workflow) {
        await ctx.db.patch(workflow._id, {
          status: workflow.backoffLevel > 0 ? "backoff" : "error",
          switchProgress: workflow.switchProgress.map((item) =>
            item.externalId === args.libreNmsDeviceId
              ? { ...item, status: "error" as const }
              : item,
          ),
        });
      }
      return "released";
    }
    if ((state.uncertainDeadlineAt ?? 0) <= Date.now()) {
      await ctx.db.patch(state._id, {
        status: "blocked",
        publicError: "Discovery expiré",
      });
      const workflow = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", args.siteId).eq("workflow", "localization"),
        )
        .unique();
      if (workflow) {
        await ctx.db.patch(workflow._id, {
          status: "blocked",
          publicError: "Discovery expiré",
        });
      }
      return "blocked";
    }
    await ctx.scheduler.runAfter(
      scheduledDelayMs(MONITOR_INTERVAL_MS),
      internal.localizationOrchestration.monitorUncertain,
      {
        siteId: args.siteId,
        attemptId: args.attemptId,
        libreNmsDeviceId: args.libreNmsDeviceId,
        switchFence: args.switchFence,
      },
    );
    return "monitoring";
  },
});

export const readStaging = internalQuery({
  args: { siteId: v.string(), attemptId: v.string() },
  handler: async (ctx, args) => {
    const [results, observations] = await Promise.all([
      ctx.db
        .query("localizationSwitchResults")
        .withIndex("by_attempt_switch", (q) =>
          q.eq("siteId", args.siteId).eq("attemptId", args.attemptId),
        )
        .collect(),
      ctx.db
        .query("localizationStagedObservations")
        .withIndex("by_attempt", (q) =>
          q.eq("siteId", args.siteId).eq("attemptId", args.attemptId),
        )
        .collect(),
    ]);
    return { results, observations };
  },
});

const toObservations = (
  capture: Awaited<
    ReturnType<
      ReturnType<typeof libreNmsClientFromEnvironment>["captureSwitch"]
    >
  >,
  deviceId: string,
) => {
  const portNameById = new Map(
    capture.ports.map((port) => [port.portId, port.ifName]),
  );
  return [
    ...capture.fdb.map((entry, index) => ({
      externalId: `fdb:${deviceId}:${entry.portId}:${capture.fetchedAt}:${index}`,
      kind: "fdb" as const,
      libreNmsDeviceId: deviceId,
      portId: entry.portId,
      portName: portNameById.get(entry.portId),
      macAddress: entry.macAddress,
      sourceObservedAt: entry.updatedAt,
      fetchedAt: capture.fetchedAt,
    })),
    ...capture.lldp.map((link, index) => ({
      externalId: `lldp:${deviceId}:${link.localPortId}:${capture.fetchedAt}:${index}`,
      kind: "lldp" as const,
      libreNmsDeviceId: deviceId,
      portId: link.localPortId,
      portName: portNameById.get(link.localPortId),
      remoteHostname: link.remoteHostname,
      fetchedAt: capture.fetchedAt,
    })),
  ];
};

export const runSwitch = internalAction({
  args: workerArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    let triggerAccepted = false;
    let previousLastDiscovered: string | undefined;
    try {
      const client = libreNmsClient(ctx);
      const heartbeat = async () =>
        await ctx.runMutation(internal.integrations.heartbeat, {
          siteId: args.siteId,
          workflow: "localization",
          attemptId: args.attemptId,
          leaseId: args.leaseId,
          fence: args.fence,
        });
      await heartbeat();
      const baseline = await client.getDevice(args.libreNmsDeviceId);
      previousLastDiscovered = baseline.lastDiscovered;
      await ctx.runMutation(internal.localizationOrchestration.recordBaseline, {
        ...args,
        previousLastDiscovered,
      });
      if (!previousLastDiscovered) {
        await ctx.runMutation(
          internal.localizationOrchestration.markUncertain,
          {
            ...args,
            publicError: "Discovery expiré",
            privateErrorCode: "discovery_already_running",
          },
        );
        return null;
      }
      await client.triggerDiscovery(args.libreNmsDeviceId, args.attemptId);
      triggerAccepted = true;
      await ctx.runMutation(
        internal.localizationOrchestration.recordTriggered,
        args,
      );

      const deadline = Date.now() + SWITCH_TIMEOUT_MS;
      let lastHeartbeatAt = Date.now();
      let lastStatus = baseline;
      while (Date.now() < deadline) {
        await sleep(POLL_INTERVAL_MS);
        if (Date.now() - lastHeartbeatAt >= 30_000) {
          await heartbeat();
          lastHeartbeatAt = Date.now();
        }
        try {
          lastStatus = await client.getDevice(args.libreNmsDeviceId);
        } catch {
          continue;
        }
        if (
          lastStatus.lastDiscovered &&
          lastStatus.lastDiscovered !== previousLastDiscovered
        ) {
          triggerAccepted = false;
          let capture:
            | Awaited<ReturnType<typeof client.captureSwitch>>
            | undefined;
          let captureError: unknown;
          for (
            let downloadAttempt = 0;
            downloadAttempt < 2;
            downloadAttempt += 1
          ) {
            try {
              capture = await client.captureSwitch(args.libreNmsDeviceId);
              break;
            } catch (error) {
              captureError = error;
              if (downloadAttempt === 0) await sleep(2_000);
            }
          }
          if (!capture) throw captureError;
          const observations = toObservations(capture, args.libreNmsDeviceId);
          const attempt = await ctx.runQuery(
            internal.localizationOrchestration.readAttempt,
            { siteId: args.siteId, attemptId: args.attemptId },
          );
          if (!attempt?.pinnedNetBoxGenerationId) {
            throw new Error("Pinned NetBox generation is missing");
          }
          await ctx.runMutation(
            internal.localizationOrchestration.stageResult,
            {
              ...args,
              netboxGenerationId: attempt.pinnedNetBoxGenerationId,
              discoveryGeneration: lastStatus.lastDiscovered,
              previousLastDiscovered,
              capturedAt: capture.fetchedAt,
              lastDiscoveredTimetaken: lastStatus.lastDiscoveredTimetaken,
              observations,
            },
          );
          return null;
        }
      }
      await ctx.runMutation(internal.localizationOrchestration.markUncertain, {
        ...args,
        publicError: "Discovery expiré",
        privateErrorCode: "discovery_uncertain",
      });
    } catch (error) {
      const uncertain =
        triggerAccepted ||
        (error instanceof LibreNmsClientError &&
          error.code === "trigger_uncertain");
      try {
        if (uncertain) {
          await ctx.runMutation(
            internal.localizationOrchestration.markUncertain,
            {
              ...args,
              publicError: "Discovery expiré",
              privateErrorCode:
                error instanceof LibreNmsClientError
                  ? error.code
                  : "discovery_uncertain",
              privateErrorDetail: privateDetail(error),
            },
          );
        } else {
          await ctx.runMutation(
            internal.localizationOrchestration.retryOrFail,
            {
              ...args,
              publicError:
                error instanceof LibreNmsClientError &&
                error.code === "trigger_refused"
                  ? "Trigger refusé"
                  : "LibreNMS inaccessible",
              privateErrorCode:
                error instanceof LibreNmsClientError
                  ? error.code
                  : "librenms_unreachable",
              privateErrorDetail: privateDetail(error),
            },
          );
        }
      } catch {
        // Another switch may already have closed or replaced the parent cycle.
      }
    }
    return null;
  },
});

export const readAttempt = internalQuery({
  args: { siteId: v.string(), attemptId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("integrationAttempts")
      .withIndex("by_site_workflow_attempt", (q) =>
        q
          .eq("siteId", args.siteId)
          .eq("workflow", "localization")
          .eq("attemptId", args.attemptId),
      )
      .unique(),
});

export const monitorUncertain = internalAction({
  args: {
    siteId: v.string(),
    attemptId: v.string(),
    libreNmsDeviceId: v.string(),
    switchFence: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let lastDiscovered: string | undefined;
    try {
      lastDiscovered = (
        await libreNmsClient(ctx).getDevice(args.libreNmsDeviceId)
      ).lastDiscovered;
    } catch {
      // The durable monitor remains authoritative until its deadline.
    }
    await ctx.runMutation(internal.localizationOrchestration.updateUncertain, {
      ...args,
      lastDiscovered,
    });
    return null;
  },
});
