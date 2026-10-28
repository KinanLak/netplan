import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const handoverOf = (ctx: QueryCtx | MutationCtx, userId: string) =>
  ctx.db
    .query("keycloakHandovers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

/**
 * Whether an admin handed this account to Keycloak and its first Keycloak
 * sign-in has not attached yet (ADR 0036).
 */
export const isPending = internalQuery({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { userId }) => (await handoverOf(ctx, userId)) !== null,
});

/** Marks an account as waiting for Keycloak, once. */
export const start = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    if (!(await handoverOf(ctx, userId))) {
      await ctx.db.insert("keycloakHandovers", { userId, at: Date.now() });
    }
    return null;
  },
});

/** The account got its Keycloak sign-in, or the admin changed their mind. */
export const end = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const row = await handoverOf(ctx, userId);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
