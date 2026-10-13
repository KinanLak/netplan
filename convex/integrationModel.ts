import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  nextAfterFailure,
  nextNetBoxAttempt,
  nextNominalAttempt,
} from "./integrationSchedule";
import { requireSite } from "./sites";

export type IntegrationWorkflow = "netbox" | "localization";

export const IMPORT_LEASE_MS = 2 * 60 * 1000;

export const getWorkflowState = async (
  ctx: MutationCtx,
  siteId: string,
  workflow: IntegrationWorkflow,
) =>
  await ctx.db
    .query("integrationWorkflowStates")
    .withIndex("by_site_workflow", (q) =>
      q.eq("siteId", siteId).eq("workflow", workflow),
    )
    .unique();

export const getAttempt = async (
  ctx: MutationCtx,
  siteId: string,
  workflow: IntegrationWorkflow,
  attemptId: string,
) =>
  await ctx.db
    .query("integrationAttempts")
    .withIndex("by_site_workflow_attempt", (q) =>
      q
        .eq("siteId", siteId)
        .eq("workflow", workflow)
        .eq("attemptId", attemptId),
    )
    .unique();

interface BeginAttemptArgs {
  siteId: string;
  workflow: IntegrationWorkflow;
  attemptId: string;
  leaseId: string;
  origin: "manual" | "scheduled";
}

export const beginWorkflowAttempt = async (
  ctx: MutationCtx,
  args: BeginAttemptArgs,
) => {
  const site = await requireSite(ctx, args.siteId);
  if (!site.enabled) throw new ConvexError("Site is disabled");

  const now = Date.now();
  const state = await getWorkflowState(ctx, args.siteId, args.workflow);
  if (state?.activeAttemptId) {
    const active = await getAttempt(
      ctx,
      args.siteId,
      args.workflow,
      state.activeAttemptId,
    );
    if (
      active?.status === "running" &&
      active.leaseExpiresAt > now &&
      active.attemptId === args.attemptId &&
      active.leaseId === args.leaseId
    ) {
      return { joined: false as const, attempt: active };
    }
    if (active?.status === "running" && active.leaseExpiresAt > now) {
      return { joined: true as const, attempt: active };
    }
    if (active?.status === "running") {
      await ctx.db.patch(active._id, {
        status: "abandoned",
        completedAt: now,
        supersededByAttemptId: args.attemptId,
      });
    }
  }

  const existingAttempt = await getAttempt(
    ctx,
    args.siteId,
    args.workflow,
    args.attemptId,
  );
  if (existingAttempt) {
    if (
      existingAttempt.status === "success" ||
      existingAttempt.status === "error"
    ) {
      return { joined: false as const, attempt: existingAttempt };
    }
    throw new ConvexError("Attempt identity has already been used");
  }

  let pinnedNetBoxGenerationId: string | undefined;
  if (args.workflow === "localization") {
    if (!site.libreNmsDevices.some((device) => device.localizationTarget)) {
      throw new ConvexError("Site has no localization target switch");
    }
    const netboxState = await getWorkflowState(ctx, args.siteId, "netbox");
    pinnedNetBoxGenerationId = netboxState?.lastPublishedId;
    if (!pinnedNetBoxGenerationId) {
      throw new ConvexError("No active NetBox generation");
    }
  }

  const fence = (state?.fenceCounter ?? 0) + 1;
  const nextScheduledAt =
    args.workflow === "netbox"
      ? nextNetBoxAttempt(now)
      : nextNominalAttempt(now, site);
  const attemptId = await ctx.db.insert("integrationAttempts", {
    siteId: args.siteId,
    workflow: args.workflow,
    attemptId: args.attemptId,
    origin: args.origin,
    status: "running",
    fence,
    leaseId: args.leaseId,
    startedAt: now,
    leaseExpiresAt: now + IMPORT_LEASE_MS,
    configVersion: site.configVersion,
    pinnedNetBoxGenerationId,
  });
  const attempt = await ctx.db.get(attemptId);
  if (!attempt) throw new Error("Attempt insert failed");

  const nextState = {
    siteId: args.siteId,
    workflow: args.workflow,
    status: "running" as const,
    fenceCounter: fence,
    activeAttemptId: args.attemptId,
    activeOrigin: args.origin,
    lastAttemptAt: now,
    lastSuccessAt: state?.lastSuccessAt,
    lastSuccessAttemptId: state?.lastSuccessAttemptId,
    lastPublishedId: state?.lastPublishedId,
    lastPrimaryCount: state?.lastPrimaryCount,
    lastSecondaryCount: state?.lastSecondaryCount,
    lastPublishedAt: state?.lastPublishedAt,
    nextScheduledAt,
    recentConfirmationMs: state?.recentConfirmationMs ?? 2 * 60 * 1000,
    backoffLevel: state?.backoffLevel ?? 0,
    backoffUntil: state?.backoffUntil,
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    timeoutMs: state?.timeoutMs ?? IMPORT_LEASE_MS,
    switchProgress:
      args.workflow === "localization"
        ? site.libreNmsDevices
            .filter((device) => device.localizationTarget)
            .map((device) => ({
              externalId: device.externalId,
              status: "pending" as const,
            }))
        : [],
    publicError: undefined,
    configVersion: site.configVersion,
  };
  if (state) await ctx.db.replace(state._id, nextState);
  else await ctx.db.insert("integrationWorkflowStates", nextState);
  return { joined: false as const, attempt };
};

interface OwnedAttemptArgs {
  siteId: string;
  workflow: IntegrationWorkflow;
  attemptId: string;
  leaseId: string;
  fence: number;
}

export const requireOwnedAttempt = async (
  ctx: MutationCtx,
  args: OwnedAttemptArgs,
): Promise<{
  state: Doc<"integrationWorkflowStates">;
  attempt: Doc<"integrationAttempts">;
  site: Doc<"sites">;
}> => {
  const [site, state, attempt] = await Promise.all([
    requireSite(ctx, args.siteId),
    getWorkflowState(ctx, args.siteId, args.workflow),
    getAttempt(ctx, args.siteId, args.workflow, args.attemptId),
  ]);
  if (
    !state ||
    !attempt ||
    state.activeAttemptId !== args.attemptId ||
    state.fenceCounter !== args.fence ||
    attempt.fence !== args.fence ||
    attempt.leaseId !== args.leaseId ||
    attempt.status !== "running"
  ) {
    throw new ConvexError("Import attempt has been replaced");
  }
  if (attempt.leaseExpiresAt <= Date.now()) {
    throw new ConvexError("Import attempt lease has expired");
  }
  if (attempt.configVersion !== site.configVersion) {
    throw new ConvexError("Site configuration changed during import");
  }
  return { state, attempt, site };
};

export const heartbeatWorkflowAttempt = async (
  ctx: MutationCtx,
  args: OwnedAttemptArgs,
) => {
  const { attempt } = await requireOwnedAttempt(ctx, args);
  const leaseExpiresAt = Date.now() + IMPORT_LEASE_MS;
  await ctx.db.patch(attempt._id, { leaseExpiresAt });
  return leaseExpiresAt;
};

export const completeWorkflowSuccess = async (
  ctx: MutationCtx,
  args: OwnedAttemptArgs & {
    publishedId: string;
    primaryCount: number;
    secondaryCount: number;
  },
) => {
  const { state, attempt } = await requireOwnedAttempt(ctx, args);
  const now = Date.now();
  await ctx.db.patch(attempt._id, {
    status: "success",
    completedAt: now,
    publishedId: args.publishedId,
    primaryCount: args.primaryCount,
    secondaryCount: args.secondaryCount,
  });
  await ctx.db.patch(state._id, {
    status: "success",
    activeAttemptId: undefined,
    activeOrigin: undefined,
    lastSuccessAt: now,
    lastSuccessAttemptId: args.attemptId,
    lastPublishedId: args.publishedId,
    lastPrimaryCount: args.primaryCount,
    lastSecondaryCount: args.secondaryCount,
    lastPublishedAt: now,
    backoffLevel: 0,
    backoffUntil: undefined,
    consecutiveFailures: 0,
    switchProgress:
      args.workflow === "localization"
        ? state.switchProgress.map((item) => ({
            ...item,
            status: "success" as const,
          }))
        : state.switchProgress,
    publicError: undefined,
  });
  return now;
};

export const failWorkflowAttempt = async (
  ctx: MutationCtx,
  args: OwnedAttemptArgs & {
    publicError: string;
    privateErrorCode?: string;
    privateErrorDetail?: string;
  },
) => {
  const { state, attempt, site } = await requireOwnedAttempt(ctx, args);
  const now = Date.now();
  const consecutiveFailures = (state.consecutiveFailures ?? 0) + 1;
  const backoffLevel =
    args.workflow === "localization"
      ? Math.min(state.backoffLevel + 1, 4)
      : state.backoffLevel;
  const nextScheduledAt =
    args.workflow === "localization"
      ? nextAfterFailure(
          state.nextScheduledAt ?? nextNominalAttempt(attempt.startedAt, site),
          now,
          backoffLevel,
        )
      : (state.nextScheduledAt ?? nextNetBoxAttempt(attempt.startedAt));
  await ctx.db.patch(attempt._id, {
    status: "error",
    completedAt: now,
    publicError: args.publicError,
    privateErrorCode: args.privateErrorCode,
    privateErrorDetail: args.privateErrorDetail,
  });
  let switchStates: Array<Doc<"switchRefreshStates">> = [];
  if (args.workflow === "localization") {
    switchStates = await ctx.db
      .query("switchRefreshStates")
      .withIndex("by_site_switch", (q) => q.eq("siteId", args.siteId))
      .collect();
    await ctx.db.insert("localizationCycles", {
      siteId: args.siteId,
      cycleId: args.attemptId,
      attemptId: args.attemptId,
      origin: attempt.origin,
      result: "error",
      startedAt: attempt.startedAt,
      completedAt: now,
      netboxGenerationId: attempt.pinnedNetBoxGenerationId as string,
      observedCount: 0,
      resolvedCount: 0,
      ambiguousCount: 0,
      unresolvableCount: 0,
      missingCount: 0,
      offlineCount: 0,
      retryCount: 0,
      backoffLevel,
      errorCode: args.privateErrorCode,
      switchResults: switchStates
        .filter(
          (switchState) =>
            switchState.lastAttemptId === args.attemptId &&
            site.libreNmsDevices.some(
              (device) =>
                device.localizationTarget &&
                device.externalId === switchState.libreNmsDeviceId,
            ),
        )
        .map((switchState) => ({
          externalId: switchState.libreNmsDeviceId,
          status: [
            "success",
            "error",
            "timeout",
            "uncertain",
            "blocked",
          ].includes(switchState.status)
            ? (switchState.status as
                | "success"
                | "error"
                | "timeout"
                | "uncertain"
                | "blocked")
            : "error",
          attemptCount: switchState.attemptCount,
          durationMs: switchState.durationMs,
          freshFdbCount: switchState.freshFdbCount,
          errorCode: switchState.privateErrorCode,
        })),
    });
    for (const switchState of switchStates) {
      if (
        switchState.lastAttemptId === args.attemptId &&
        switchState.status !== "uncertain" &&
        switchState.status !== "blocked"
      ) {
        await ctx.db.patch(switchState._id, {
          status: "error",
          activeAttemptId: undefined,
          completedAt: now,
          durationMs: switchState.startedAt
            ? now - switchState.startedAt
            : undefined,
          publicError: args.publicError,
          privateErrorCode: args.privateErrorCode,
        });
      }
    }
  }
  await ctx.db.patch(state._id, {
    status: args.workflow === "localization" ? "backoff" : "error",
    activeAttemptId: undefined,
    activeOrigin: undefined,
    backoffLevel,
    backoffUntil:
      args.workflow === "localization" ? nextScheduledAt : undefined,
    consecutiveFailures,
    nextScheduledAt,
    switchProgress:
      args.workflow === "localization"
        ? state.switchProgress.map((item) => {
            const switchState = switchStates.find(
              (candidate) =>
                candidate.lastAttemptId === args.attemptId &&
                candidate.libreNmsDeviceId === item.externalId,
            );
            return switchState
              ? {
                  ...item,
                  status:
                    switchState.status === "uncertain" ||
                    switchState.status === "blocked"
                      ? switchState.status
                      : ("error" as const),
                }
              : item;
          })
        : state.switchProgress,
    publicError: args.publicError,
  });
};
