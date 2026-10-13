import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import {
  beginWorkflowAttempt,
  failWorkflowAttempt,
  heartbeatWorkflowAttempt,
} from "./integrationModel";

const workflow = v.union(v.literal("netbox"), v.literal("localization"));
const origin = v.union(v.literal("manual"), v.literal("scheduled"));

const attemptResult = v.object({
  joined: v.boolean(),
  attemptId: v.string(),
  leaseId: v.string(),
  fence: v.number(),
  status: v.union(
    v.literal("running"),
    v.literal("success"),
    v.literal("error"),
    v.literal("abandoned"),
  ),
  leaseExpiresAt: v.number(),
  pinnedNetBoxGenerationId: v.optional(v.string()),
  publishedId: v.optional(v.string()),
});

export const begin = internalMutation({
  args: {
    siteId: v.string(),
    workflow,
    attemptId: v.string(),
    leaseId: v.string(),
    origin,
  },
  returns: attemptResult,
  handler: async (ctx, args) => {
    const result = await beginWorkflowAttempt(ctx, args);
    return {
      joined: result.joined,
      attemptId: result.attempt.attemptId,
      leaseId: result.attempt.leaseId,
      fence: result.attempt.fence,
      status: result.attempt.status,
      leaseExpiresAt: result.attempt.leaseExpiresAt,
      pinnedNetBoxGenerationId: result.attempt.pinnedNetBoxGenerationId,
      publishedId: result.attempt.publishedId,
    };
  },
});

export const heartbeat = internalMutation({
  args: {
    siteId: v.string(),
    workflow,
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => await heartbeatWorkflowAttempt(ctx, args),
});

export const fail = internalMutation({
  args: {
    siteId: v.string(),
    workflow,
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
    publicError: v.string(),
    privateErrorCode: v.optional(v.string()),
    privateErrorDetail: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await failWorkflowAttempt(ctx, args);
    return null;
  },
});

export const getState = query({
  args: { siteId: v.string(), workflow },
  returns: v.union(
    v.null(),
    v.object({
      siteId: v.string(),
      workflow,
      status: v.union(
        v.literal("idle"),
        v.literal("running"),
        v.literal("success"),
        v.literal("error"),
        v.literal("backoff"),
        v.literal("blocked"),
        v.literal("disabled"),
      ),
      activeAttemptId: v.optional(v.string()),
      activeOrigin: v.optional(
        v.union(v.literal("manual"), v.literal("scheduled")),
      ),
      lastAttemptAt: v.optional(v.number()),
      lastSuccessAt: v.optional(v.number()),
      lastPublishedId: v.optional(v.string()),
      lastPrimaryCount: v.optional(v.number()),
      lastSecondaryCount: v.optional(v.number()),
      lastPublishedAt: v.optional(v.number()),
      nextScheduledAt: v.optional(v.number()),
      recentConfirmationMs: v.number(),
      backoffLevel: v.number(),
      backoffUntil: v.optional(v.number()),
      consecutiveFailures: v.number(),
      timeoutMs: v.number(),
      switchProgress: v.array(
        v.object({
          externalId: v.string(),
          status: v.union(
            v.literal("pending"),
            v.literal("triggered"),
            v.literal("refreshing"),
            v.literal("success"),
            v.literal("error"),
            v.literal("timeout"),
            v.literal("uncertain"),
            v.literal("blocked"),
          ),
        }),
      ),
      publicError: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { siteId, workflow: selectedWorkflow }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", selectedWorkflow),
      )
      .unique();
    if (!state) return null;
    return {
      siteId: state.siteId,
      workflow: state.workflow,
      status: state.status,
      activeAttemptId: state.activeAttemptId,
      activeOrigin: state.activeOrigin,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      lastPublishedId: state.lastPublishedId,
      lastPrimaryCount: state.lastPrimaryCount,
      lastSecondaryCount: state.lastSecondaryCount,
      lastPublishedAt: state.lastPublishedAt,
      nextScheduledAt: state.nextScheduledAt,
      recentConfirmationMs: state.recentConfirmationMs,
      backoffLevel: state.backoffLevel,
      backoffUntil: state.backoffUntil,
      consecutiveFailures: state.consecutiveFailures ?? 0,
      timeoutMs: state.timeoutMs,
      switchProgress: state.switchProgress,
      publicError: state.publicError,
    };
  },
});
