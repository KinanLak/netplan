import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { endSessions } from "./lib/sessions";

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

/**
 * What the password and session guards need to know about an account, read
 * in one transaction so that no handover step can fall between two reads.
 */
export const signInState = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    awaitingKeycloak: v.boolean(),
    hasKeycloak: v.boolean(),
    hasPassword: v.boolean(),
  }),
  handler: async (ctx, { userId }) => {
    const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "account",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { numItems: 10, cursor: null },
    });
    const providers = (page.page as Array<{ providerId: string }>).map(
      (account) => account.providerId,
    );
    return {
      awaitingKeycloak: (await handoverOf(ctx, userId)) !== null,
      hasKeycloak: providers.includes("keycloak"),
      hasPassword: providers.includes("credential"),
    };
  },
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

/**
 * Ends the wait: the account got its Keycloak sign-in, or the admin changed
 * their mind. A password sign-in or reset that was already past its checks
 * when the handover began may have written a session or a password since;
 * both go now, before the wait that made them useless is lifted. A Keycloak
 * sign-in calls this before writing its own session.
 */
export const end = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const row = await handoverOf(ctx, userId);
    if (!row) return null;
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: "account",
        where: [
          { field: "userId", value: userId },
          { field: "providerId", value: "credential" },
        ],
      },
      paginationOpts: { numItems: 10, cursor: null },
    });
    await endSessions(ctx, userId);
    await ctx.db.delete(row._id);
    return null;
  },
});
