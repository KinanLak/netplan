import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import {
  beginWorkflowAttempt,
  getAttempt,
  getWorkflowState,
} from "./integrationModel";
import type { IntegrationWorkflow } from "./integrationModel";
import { nextNetBoxAttempt, nextNominalAttempt } from "./integrationSchedule";
import { requireSite } from "./sites";

declare const process: { env: Record<string, string | undefined> };

const SWITCH_LOCK_MS = 12 * 60 * 1000;
const workerDelayMs = (): number =>
  process.env.NODE_ENV === "test" ? 24 * 60 * 60 * 1000 : 1_000;

const reserveAndSchedule = async (
  ctx: MutationCtx,
  args: {
    siteId: string;
    workflow: IntegrationWorkflow;
    origin: "manual" | "scheduled";
  },
) => {
  const state = await getWorkflowState(ctx, args.siteId, args.workflow);
  const fence = (state?.fenceCounter ?? 0) + 1;
  const now = Date.now();
  const attemptId = `attempt:${args.siteId}:${args.workflow}:${fence}:${now}`;
  const leaseId = `lease:${args.siteId}:${args.workflow}:${fence}:${now}`;
  const result = await beginWorkflowAttempt(ctx, {
    ...args,
    attemptId,
    leaseId,
  });
  if (result.joined || result.attempt.status !== "running") return result;

  if (args.workflow === "netbox") {
    return result;
  }

  const site = await requireSite(ctx, args.siteId);
  const targets = site.libreNmsDevices.filter(
    (device) => device.localizationTarget,
  );
  for (const target of targets) {
    const existing = await ctx.db
      .query("switchRefreshStates")
      .withIndex("by_site_switch", (q) =>
        q.eq("siteId", args.siteId).eq("libreNmsDeviceId", target.externalId),
      )
      .unique();
    const switchFence = (existing?.fence ?? 0) + 1;
    const nextState = {
      siteId: args.siteId,
      libreNmsDeviceId: target.externalId,
      status: "pending" as const,
      lastAttemptId: result.attempt.attemptId,
      activeAttemptId: result.attempt.attemptId,
      fence: switchFence,
      leaseExpiresAt: now + SWITCH_LOCK_MS,
      attemptCount: 1,
      startedAt: now,
      completedAt: undefined,
      durationMs: undefined,
      freshFdbCount: undefined,
      previousLastDiscovered: undefined,
      newLastDiscovered: undefined,
      lastDiscoveredTimetaken: undefined,
      stagedResultId: undefined,
      stagedCapturedAt: undefined,
      triggerStartedAt: undefined,
      triggerAcceptedAt: undefined,
      pollingDeadlineAt: undefined,
      uncertainDeadlineAt: undefined,
      privateErrorCode: undefined,
      publicError: undefined,
    };
    if (existing) await ctx.db.replace(existing._id, nextState);
    else await ctx.db.insert("switchRefreshStates", nextState);
  }
  return result;
};

const activeAttempt = async (
  ctx: MutationCtx,
  siteId: string,
  workflow: IntegrationWorkflow,
) => {
  const state = await getWorkflowState(ctx, siteId, workflow);
  if (!state?.activeAttemptId) return null;
  const attempt = await getAttempt(
    ctx,
    siteId,
    workflow,
    state.activeAttemptId,
  );
  return attempt?.status === "running" && attempt.leaseExpiresAt > Date.now()
    ? attempt
    : null;
};

const blockingSwitch = async (ctx: MutationCtx, siteId: string) => {
  const states = await ctx.db
    .query("switchRefreshStates")
    .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
    .collect();
  const ambiguousStates = states.filter(
    (state) =>
      state.activeAttemptId !== undefined &&
      (state.status === "refreshing" || state.status === "triggered"),
  );
  const workflow = await getWorkflowState(ctx, siteId, "localization");
  const now = Date.now();
  let recovered:
    | { libreNmsDeviceId: string; status: "uncertain" | "blocked" }
    | undefined;
  for (const ambiguous of ambiguousStates) {
    const activeAttemptId = ambiguous.activeAttemptId;
    if (!activeAttemptId) continue;
    const attempt = await getAttempt(
      ctx,
      siteId,
      "localization",
      activeAttemptId,
    );
    if (attempt?.status === "running" && attempt.leaseExpiresAt > now) continue;
    if (attempt?.status === "running") {
      await ctx.db.patch(attempt._id, {
        status: "abandoned",
        completedAt: now,
      });
    }
    if (workflow?.activeAttemptId === activeAttemptId) {
      await ctx.db.patch(workflow._id, {
        status: "error",
        activeAttemptId: undefined,
        activeOrigin: undefined,
        publicError: "Discovery expiré",
      });
    }
    const uncertainDeadlineAt =
      (ambiguous.pollingDeadlineAt ?? now) + 10 * 60 * 1000;
    const status = uncertainDeadlineAt <= now ? "blocked" : "uncertain";
    await ctx.db.patch(ambiguous._id, {
      status,
      uncertainDeadlineAt,
      leaseExpiresAt: uncertainDeadlineAt,
      publicError: "Discovery expiré",
      privateErrorCode: "worker_recovery_uncertain",
    });
    if (status === "uncertain") {
      await ctx.scheduler.runAfter(
        workerDelayMs(),
        internal.localizationOrchestration.monitorUncertain,
        {
          siteId,
          attemptId: activeAttemptId,
          libreNmsDeviceId: ambiguous.libreNmsDeviceId,
          switchFence: ambiguous.fence,
        },
      );
    } else if (workflow) {
      await ctx.db.patch(workflow._id, {
        status: "blocked",
        publicError: "Discovery expiré",
      });
    }
    if (!recovered || status === "blocked") {
      recovered = {
        libreNmsDeviceId: ambiguous.libreNmsDeviceId,
        status,
      };
    }
  }
  const blocked =
    states.find((state) => state.status === "blocked") ??
    states.find((state) => state.status === "uncertain");
  return blocked
    ? {
        libreNmsDeviceId: blocked.libreNmsDeviceId,
        status: blocked.status as "uncertain" | "blocked",
      }
    : recovered;
};

export const requestManualLocalization = mutation({
  args: {
    siteId: v.string(),
    confirmedSnapshotId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ status: v.literal("disabled") }),
    v.object({ status: v.literal("started"), attemptId: v.string() }),
    v.object({ status: v.literal("joined_existing"), attemptId: v.string() }),
    v.object({
      status: v.literal("switch_blocked"),
      libreNmsDeviceId: v.string(),
      switchStatus: v.union(v.literal("uncertain"), v.literal("blocked")),
    }),
    v.object({
      status: v.literal("confirmation_required"),
      snapshotId: v.string(),
      publishedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    if (process.env.INTEGRATION_MANUAL_REFRESH_ENABLED !== "true") {
      return { status: "disabled" as const };
    }
    const active = await activeAttempt(ctx, args.siteId, "localization");
    if (active) {
      return {
        status: "joined_existing" as const,
        attemptId: active.attemptId,
      };
    }
    const blocked = await blockingSwitch(ctx, args.siteId);
    if (blocked) {
      return {
        status: "switch_blocked" as const,
        libreNmsDeviceId: blocked.libreNmsDeviceId,
        switchStatus: blocked.status,
      };
    }
    const state = await getWorkflowState(ctx, args.siteId, "localization");
    if (
      state?.lastPublishedId &&
      state.lastPublishedAt &&
      Date.now() - state.lastPublishedAt < state.recentConfirmationMs &&
      args.confirmedSnapshotId !== state.lastPublishedId
    ) {
      return {
        status: "confirmation_required" as const,
        snapshotId: state.lastPublishedId,
        publishedAt: state.lastPublishedAt,
      };
    }
    const result = await reserveAndSchedule(ctx, {
      siteId: args.siteId,
      workflow: "localization",
      origin: "manual",
    });
    return {
      status: result.joined
        ? ("joined_existing" as const)
        : ("started" as const),
      attemptId: result.attempt.attemptId,
    };
  },
});

export const scanDue = internalMutation({
  args: {},
  returns: v.object({ started: v.number(), skipped: v.number() }),
  handler: async (ctx) => {
    if (process.env.INTEGRATION_SCHEDULER_ENABLED !== "true") {
      return { started: 0, skipped: 0 };
    }
    const now = Date.now();
    const sites = (await ctx.db.query("sites").collect()).filter(
      (site) => site.enabled,
    );
    let started = 0;
    let skipped = 0;
    for (const site of sites) {
      for (const workflow of ["netbox", "localization"] as const) {
        const state = await getWorkflowState(ctx, site.objectId, workflow);
        if (
          !state ||
          (state.nextScheduledAt !== undefined && state.nextScheduledAt > now)
        ) {
          continue;
        }
        if (
          workflow === "localization" &&
          !site.libreNmsDevices.some((device) => device.localizationTarget)
        ) {
          await ctx.db.patch(state._id, {
            status: "disabled",
            nextScheduledAt: undefined,
          });
          skipped += 1;
          continue;
        }
        if (workflow === "localization") {
          const netboxState = await getWorkflowState(
            ctx,
            site.objectId,
            "netbox",
          );
          if (!netboxState?.lastPublishedId) {
            skipped += 1;
            continue;
          }
        }
        const active = await activeAttempt(ctx, site.objectId, workflow);
        if (active) {
          await ctx.db.patch(state._id, {
            nextScheduledAt:
              workflow === "netbox"
                ? nextNetBoxAttempt(now)
                : nextNominalAttempt(now, site),
          });
          skipped += 1;
          continue;
        }
        const blockedSwitch =
          workflow === "localization"
            ? await blockingSwitch(ctx, site.objectId)
            : undefined;
        if (blockedSwitch) {
          await ctx.db.patch(state._id, {
            status:
              blockedSwitch.status === "blocked"
                ? "blocked"
                : state.backoffLevel > 0
                  ? "backoff"
                  : "error",
            nextScheduledAt:
              blockedSwitch.status === "uncertain"
                ? nextNominalAttempt(now, site)
                : state.nextScheduledAt,
          });
          skipped += 1;
          continue;
        }
        await reserveAndSchedule(ctx, {
          siteId: site.objectId,
          workflow,
          origin: "scheduled",
        });
        started += 1;
      }
    }
    return { started, skipped };
  },
});

export const getWorkerConfig = internalQuery({
  args: { siteId: v.string() },
  handler: async (ctx, { siteId }) => {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    if (!site) throw new Error("Site not found");
    return {
      siteId: site.objectId,
      netboxInstanceKey: site.netboxInstanceKey,
      netboxExternalSiteId: site.netboxExternalSiteId,
      netboxExternalSiteSlug: site.netboxExternalSiteSlug,
      libreNmsInstanceKey: site.libreNmsInstanceKey,
      libreNmsDevices: site.libreNmsDevices,
    };
  },
});
