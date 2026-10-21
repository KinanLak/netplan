import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";

/** Records that an account has just signed in (the users page shows it). */
export async function noteSignIn(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
): Promise<void> {
  const at = Date.now();
  const row = await ctx.db
    .query("signIns")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (row) await ctx.db.patch(row._id, { at });
  else await ctx.db.insert("signIns", { userId, at });
}
