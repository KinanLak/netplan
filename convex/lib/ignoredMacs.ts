// The unknown MACs an Éditeur chose to ignore (ADR 0026). They outlive the
// sightings, which come and go with each cycle.
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const ignoredRowsOf = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("ignoredMacs")
    .withIndex("by_site_mac", (q) => q.eq("siteId", siteId))
    .collect();

export const ignoredMacsOf = async (ctx: QueryCtx, siteId: string) =>
  new Set((await ignoredRowsOf(ctx, siteId)).map(({ mac }) => mac));

export const deleteIgnoredMacs = async (ctx: MutationCtx, siteId: string) => {
  for (const row of await ignoredRowsOf(ctx, siteId)) {
    await ctx.db.delete(row._id);
  }
};
