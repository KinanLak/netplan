// A site's collection cycle row (ADR 0023), shared by the cycle itself and
// the site settings that schedule it.
import { nextRunAt } from "../../src/sites/cadence";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * How long a cycle may run before another may take over: longer than a cycle
 * can take, since an action stops after ten minutes.
 */
export const LEASE_MS = 15 * 60_000;

export const cycleOf = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("siteCycles")
    .withIndex("by_site", (q) => q.eq("siteId", siteId))
    .unique();

export const isRunning = (
  cycle: Doc<"siteCycles"> | null,
  now: number,
): boolean => cycle?.running !== undefined && cycle.running.leaseUntil > now;

/**
 * Brings the next cycle forward when a shorter interval would have run it
 * sooner; a longer one waits for the cycle already planned.
 */
export const rescheduleCycle = async (
  ctx: MutationCtx,
  site: Doc<"sites">,
): Promise<void> => {
  const cycle = await cycleOf(ctx, site.objectId);
  if (!cycle?.last || cycle.failures > 0) return;
  const next = nextRunAt(site.intervalMinutes, cycle.last.startedAt);
  if (next < cycle.nextRunAt)
    await ctx.db.patch(cycle._id, { nextRunAt: next });
};

export const deleteCycle = async (
  ctx: MutationCtx,
  siteId: string,
): Promise<void> => {
  const cycle = await cycleOf(ctx, siteId);
  if (cycle) await ctx.db.delete(cycle._id);
};
