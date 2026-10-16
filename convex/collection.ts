// A site's collection cycle (ADR 0023): a cron starts the cycles that are
// due, an Éditeur may start one at once, and a lease keeps two from running
// together. Each cycle asks every enabled source in turn and records what
// each answered for the admin.
import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { openConnection } from "./integrations";
import { cycleOf, isRunning, LEASE_MS } from "./lib/cycles";
import { collectFromLibreNMS, expireStaleReads } from "./librenmsCycle";
import { importFromNetBox } from "./netboxImport";
import { schedulePush } from "./netboxPush";
import { adminQuery, editorMutation, readerQuery } from "./lib/functions";
import { SOURCE_RETRY } from "./lib/httpRetry";
import { probeIntegration } from "./lib/integrationProbe";
import { requireSite } from "./sites";
import {
  cycleRun,
  cycleStep,
  integrationKind,
  siteCadence,
} from "./siteValidators";
import { nextRunAt, retryAt } from "../src/sites/cadence";
import { INTEGRATION_KINDS } from "../src/sites/integrations";
import type { IntegrationKind } from "../src/sites/integrations";

/** Ends the cycle if it still holds this lease once it runs out. */
const scheduleExpiry = async (
  ctx: MutationCtx,
  siteId: string,
  cycleId: string,
) => {
  await ctx.scheduler.runAfter(LEASE_MS + 1000, internal.collection.expire, {
    siteId,
    cycleId,
  });
};

type CycleStep = Infer<typeof cycleStep>;

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

const siteOf = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
    .unique();

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
  // In case the action never starts.
  await scheduleExpiry(ctx, siteId, running.cycleId);
  return running.startedAt;
};

/**
 * Run by the cron every minute: removes the statuses a read no longer
 * vouches for, and starts the cycle of each site that is due.
 */
export const startDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    let started = 0;
    for (const site of await ctx.db.query("sites").collect()) {
      const cycle = await cycleOf(ctx, site.objectId);
      // Statuses expire even while cycles are paused or off, since nothing
      // keeps them true then (ADR 0025).
      if (cycle) await expireStaleReads(ctx, site, cycle, now);
      if (collectionPaused() || !site.automaticRefresh) continue;
      if (isRunning(cycle, now) || (cycle && cycle.nextRunAt > now)) continue;
      if ((await enabledSources(ctx, site.objectId)).length === 0) continue;
      await begin(ctx, site.objectId, cycle, false, now);
      started += 1;
    }
    return started;
  },
});

/**
 * "Actualiser": a cycle now, unless one is running. Returns when it started,
 * so the page that asked can tell the person how it ended.
 */
export const refresh = editorMutation({
  args: { siteId: v.string() },
  returns: v.number(),
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
    return await begin(ctx, siteId, cycle, true, now);
  },
});

/**
 * Run as a cycle's action starts: renews its lease from now, since the action
 * may have waited in the queue, and returns the sources to ask. `null` when
 * the cycle no longer holds the lease or collection was paused meanwhile.
 */
export const claim = internalMutation({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.union(v.null(), v.array(integrationKind)),
  handler: async (ctx, { siteId, cycleId }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (!cycle?.running || cycle.running.cycleId !== cycleId) return null;
    if (collectionPaused()) {
      await ctx.db.patch(cycle._id, { running: undefined });
      return null;
    }
    await ctx.db.patch(cycle._id, {
      running: { ...cycle.running, leaseUntil: Date.now() + LEASE_MS },
    });
    await scheduleExpiry(ctx, siteId, cycleId);
    return await enabledSources(ctx, siteId);
  },
});

const collectFrom = async (
  ctx: ActionCtx,
  siteId: string,
  cycleId: string,
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
    if (!answer.ok) return { source, ...answer };
    const collected =
      source === "netbox"
        ? await importFromNetBox(ctx, siteId, cycleId, connection)
        : await collectFromLibreNMS(ctx, siteId, cycleId, connection);
    return {
      ...collected,
      source,
      message: [answer.message, collected.message].filter(Boolean).join(" "),
    };
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
    const sources = await ctx.runMutation(internal.collection.claim, {
      siteId,
      cycleId,
    });
    if (sources === null) return null;
    const steps: Array<CycleStep> = [];
    for (const source of sources) {
      steps.push(await collectFrom(ctx, siteId, cycleId, source));
    }
    await ctx.runMutation(internal.collection.finish, {
      siteId,
      cycleId,
      steps,
    });
    return null;
  },
});

/**
 * Records a cycle's outcome, plans the next one, and starts the push to
 * NetBox, which sends what this cycle saw.
 */
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
    const site = await siteOf(ctx, siteId);
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
      ...(ok ? { lastSuccessAt: startedAt } : {}),
    });
    await schedulePush(ctx, siteId);
    return null;
  },
});

/**
 * A cycle whose action died without reporting: it counts as a failure, and
 * its row changes so the admin's page stops showing it as running.
 */
export const expire = internalMutation({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId, cycleId }) => {
    const cycle = await cycleOf(ctx, siteId);
    const now = Date.now();
    if (
      !cycle?.running ||
      cycle.running.cycleId !== cycleId ||
      cycle.running.leaseUntil > now
    ) {
      return null;
    }
    const site = await siteOf(ctx, siteId);
    if (!site) {
      await ctx.db.delete(cycle._id);
      return null;
    }
    const failures = cycle.failures + 1;
    await ctx.db.patch(cycle._id, {
      running: undefined,
      failures,
      nextRunAt: retryAt(site.cadence, site.timezone, now, failures),
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

/** What `freshness` says of a site (`SiteFreshness`, ADR 0026). */
export const siteFreshness = v.object({
  paused: v.boolean(),
  hasSources: v.boolean(),
  automaticRefresh: v.boolean(),
  manualRefresh: v.boolean(),
  cadence: siteCadence,
  timezone: v.string(),
  running: v.union(
    v.null(),
    v.object({ startedAt: v.number(), manual: v.boolean() }),
  ),
  /** The last cycle that ended, and the sources that failed in it. */
  last: v.union(
    v.null(),
    v.object({
      startedAt: v.number(),
      finishedAt: v.number(),
      failed: v.array(integrationKind),
    }),
  ),
  lastSuccessAt: v.union(v.null(), v.number()),
  nextRunAt: v.union(v.null(), v.number()),
  failures: v.number(),
});

export const freshnessOf = async (
  ctx: QueryCtx,
  site: Doc<"sites">,
  cycle: Doc<"siteCycles"> | null,
): Promise<Infer<typeof siteFreshness>> => {
  const last = cycle?.last;
  return {
    paused: collectionPaused(),
    hasSources: (await enabledSources(ctx, site.objectId)).length > 0,
    automaticRefresh: site.automaticRefresh,
    manualRefresh: site.manualRefresh,
    cadence: site.cadence,
    timezone: site.timezone,
    running:
      cycle?.running && isRunning(cycle, Date.now())
        ? { startedAt: cycle.running.startedAt, manual: cycle.running.manual }
        : null,
    last: last
      ? {
          startedAt: last.startedAt,
          finishedAt: last.finishedAt,
          failed: last.steps
            .filter((step) => !step.ok)
            .map((step) => step.source),
        }
      : null,
    lastSuccessAt: cycle?.lastSuccessAt ?? null,
    nextRunAt: cycle ? cycle.nextRunAt : null,
    failures: cycle?.failures ?? 0,
  };
};

/**
 * How fresh a site's data is and when it is next collected, for everyone
 * who reads the site (ADR 0026). The client ages it against its own clock.
 * `null` when the site is gone.
 */
export const freshness = readerQuery({
  args: { siteId: v.string() },
  returns: v.union(v.null(), siteFreshness),
  handler: async (ctx, { siteId }) => {
    const site = await siteOf(ctx, siteId);
    if (!site) return null;
    return await freshnessOf(ctx, site, await cycleOf(ctx, siteId));
  },
});
