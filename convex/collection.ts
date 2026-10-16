// A site's collection cycle (ADR 0023): a cron starts the cycles that are
// due, an Éditeur may start one at once, and a lease keeps two from running
// together. Each cycle asks every enabled source in turn and records what
// each answered for the admin.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { openConnection } from "./integrations";
import { cycleOf, isRunning } from "./lib/cycles";
import { adminQuery, editorMutation } from "./lib/functions";
import { SOURCE_RETRY } from "./lib/httpRetry";
import { probeIntegration } from "./lib/integrationProbe";
import { requireSite } from "./sites";
import { cycleRun, cycleStep, integrationKind } from "./siteValidators";
import { nextRunAt, retryAt } from "../src/sites/cadence";
import { INTEGRATION_KINDS } from "../src/sites/integrations";
import type { IntegrationKind } from "../src/sites/integrations";

// Longer than a cycle can take: each source retries for a few minutes at
// most, and LibreNMS waits up to two for its discovery.
const LEASE_MS = 15 * 60_000;

type CycleStep = { source: IntegrationKind; ok: boolean; message: string };

/**
 * `NETPLAN_COLLECTION_PAUSED=true` stops every cycle, automatic or manual,
 * on this deployment (ADR 0010's environment kill switch).
 */
const collectionPaused = () => process.env.NETPLAN_COLLECTION_PAUSED === "true";

const enabledSources = async (
  ctx: QueryCtx,
  siteId: string,
): Promise<Array<IntegrationKind>> => {
  const rows = await ctx.db
    .query("integrations")
    .withIndex("by_site_kind", (q) => q.eq("siteId", siteId))
    .collect();
  // NetBox first: LibreNMS matches its ports against the inventory NetBox
  // has just brought.
  return INTEGRATION_KINDS.filter((kind) =>
    rows.some((row) => row.kind === kind && row.enabled),
  );
};

const begin = async (
  ctx: MutationCtx,
  siteId: string,
  cycle: Doc<"siteCycles"> | null,
  manual: boolean,
  now: number,
) => {
  const running = {
    cycleId: crypto.randomUUID(),
    startedAt: now,
    leaseUntil: now + LEASE_MS,
    manual,
  };
  if (cycle) {
    await ctx.db.patch(cycle._id, { running });
  } else {
    await ctx.db.insert("siteCycles", {
      siteId,
      nextRunAt: now,
      failures: 0,
      running,
    });
  }
  await ctx.scheduler.runAfter(0, internal.collection.run, {
    siteId,
    cycleId: running.cycleId,
  });
};

/** Run by the cron every minute: starts the cycle of each site that is due. */
export const startDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (collectionPaused()) return 0;
    const now = Date.now();
    let started = 0;
    for (const site of await ctx.db.query("sites").collect()) {
      if (!site.automaticRefresh) continue;
      const cycle = await cycleOf(ctx, site.objectId);
      if (isRunning(cycle, now) || (cycle && cycle.nextRunAt > now)) continue;
      if ((await enabledSources(ctx, site.objectId)).length === 0) continue;
      await begin(ctx, site.objectId, cycle, false, now);
      started += 1;
    }
    return started;
  },
});

/** "Actualiser": a cycle now, unless one is running. */
export const refresh = editorMutation({
  args: { siteId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId }) => {
    const site = await requireSite(ctx, siteId);
    if (!site.manualRefresh) {
      throw new ConvexError(
        "L'actualisation manuelle est désactivée pour ce site.",
      );
    }
    if (collectionPaused()) {
      throw new ConvexError("La collecte est suspendue sur ce serveur.");
    }
    const now = Date.now();
    const cycle = await cycleOf(ctx, siteId);
    if (isRunning(cycle, now)) {
      throw new ConvexError("Une collecte est déjà en cours pour ce site.");
    }
    if ((await enabledSources(ctx, siteId)).length === 0) {
      throw new ConvexError("Ce site n'a aucune intégration active.");
    }
    await begin(ctx, siteId, cycle, true, now);
    return null;
  },
});

/** The sources a cycle asks, or `null` when it no longer holds the lease. */
export const plan = internalQuery({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.union(v.null(), v.array(integrationKind)),
  handler: async (ctx, { siteId, cycleId }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== cycleId) return null;
    return await enabledSources(ctx, siteId);
  },
});

const collectFrom = async (
  ctx: ActionCtx,
  siteId: string,
  source: IntegrationKind,
): Promise<CycleStep> => {
  try {
    const connection = await openConnection(ctx, siteId, source);
    if ("error" in connection) {
      return { source, ok: false, message: connection.error };
    }
    const answer = await probeIntegration(
      source,
      connection.baseUrl,
      connection.token,
      SOURCE_RETRY,
    );
    return { source, ...answer };
  } catch (error) {
    // The token is never part of an error the source code builds.
    console.error(`collection ${siteId} ${source}`, error);
    return {
      source,
      ok: false,
      message: "Erreur inattendue pendant la collecte.",
    };
  }
};

export const run = internalAction({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId, cycleId }) => {
    const sources = await ctx.runQuery(internal.collection.plan, {
      siteId,
      cycleId,
    });
    if (sources === null) return null;
    const steps: Array<CycleStep> = [];
    for (const source of sources) {
      steps.push(await collectFrom(ctx, siteId, source));
    }
    await ctx.runMutation(internal.collection.finish, {
      siteId,
      cycleId,
      steps,
    });
    return null;
  },
});

/** Records a cycle's outcome and plans the next one. */
export const finish = internalMutation({
  args: {
    siteId: v.string(),
    cycleId: v.string(),
    steps: v.array(cycleStep),
  },
  returns: v.null(),
  handler: async (ctx, { siteId, cycleId, steps }) => {
    const cycle = await cycleOf(ctx, siteId);
    // Its lease ran out and another cycle took over: that one reports.
    if (!cycle?.running || cycle.running.cycleId !== cycleId) return null;
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    if (!site) {
      await ctx.db.delete(cycle._id);
      return null;
    }
    const { startedAt, manual } = cycle.running;
    const ok = steps.every((step) => step.ok);
    const failures = ok ? 0 : cycle.failures + 1;
    await ctx.db.patch(cycle._id, {
      running: undefined,
      failures,
      nextRunAt: ok
        ? nextRunAt(site.cadence, site.timezone, startedAt)
        : retryAt(site.cadence, site.timezone, startedAt, failures),
      last: { startedAt, finishedAt: Date.now(), manual, steps },
    });
    return null;
  },
});

/** The last cycle, the one running and the next one, for the admin. */
export const status = adminQuery({
  args: { siteId: v.string() },
  returns: v.object({
    paused: v.boolean(),
    running: v.union(
      v.null(),
      v.object({ startedAt: v.number(), manual: v.boolean() }),
    ),
    last: v.union(v.null(), cycleRun),
    /** `null` before the first cycle. */
    nextRunAt: v.union(v.null(), v.number()),
    failures: v.number(),
  }),
  handler: async (ctx, { siteId }) => {
    const cycle = await cycleOf(ctx, siteId);
    // A lease that ran out is a cycle that died; the cron starts another.
    const running =
      cycle?.running && isRunning(cycle, Date.now())
        ? { startedAt: cycle.running.startedAt, manual: cycle.running.manual }
        : null;
    return {
      paused: collectionPaused(),
      running,
      last: cycle?.last ?? null,
      nextRunAt: cycle ? cycle.nextRunAt : null,
      failures: cycle?.failures ?? 0,
    };
  },
});
