import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  SIGN_IN_WINDOW_MS,
  countAttempt,
  normalizeIdentifier,
} from "./lib/signInLimit";

/**
 * Counts a sign-in attempt for the identifier typed; false once it has had
 * its share for the minute (ADR 0031). Run by the sign-in hook before
 * better-auth checks the password.
 */
export const consume = internalMutation({
  args: { identifier: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const identifier = normalizeIdentifier(args.identifier);
    const row = await ctx.db
      .query("signInAttempts")
      .withIndex("by_identifier", (q) => q.eq("identifier", identifier))
      .unique();
    const { allowed, next } = countAttempt(row, Date.now());
    if (!row) {
      await ctx.db.insert("signInAttempts", { identifier, ...next });
    } else if (next !== row) {
      await ctx.db.patch(row._id, next);
    }
    return allowed;
  },
});

const PURGE_BATCH = 1000;

/**
 * Drops the windows that have ended, so identifiers tried once do not pile
 * up; a full batch runs again until none is left.
 */
export const purge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ended = await ctx.db
      .query("signInAttempts")
      .withIndex("by_window_start", (q) =>
        q.lt("windowStart", Date.now() - SIGN_IN_WINDOW_MS),
      )
      .take(PURGE_BATCH);
    await Promise.all(ended.map((row) => ctx.db.delete(row._id)));
    if (ended.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.signInAttempts.purge, {});
    }
    return null;
  },
});
