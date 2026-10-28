import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import {
  ATTEMPTS_FORGOTTEN_AFTER_MS,
  countAttempt,
  normalizeIdentifier,
} from "./lib/signInLimit";
import type { AttemptKind } from "./lib/signInLimit";

const attemptKind = v.union(v.literal("sign-in"), v.literal("password-reset"));

const recordOf = (ctx: MutationCtx, kind: AttemptKind, identifier: string) =>
  ctx.db
    .query("authAttempts")
    .withIndex("by_kind_and_identifier", (q) =>
      q.eq("kind", kind).eq("identifier", normalizeIdentifier(identifier)),
    )
    .unique();

/**
 * Counts an attempt for the identifier typed, before better-auth looks it
 * up, so a known and an unknown identifier count alike (ADR 0036). Answers
 * how long to wait when it is refused.
 */
export const consume = internalMutation({
  args: { kind: attemptKind, identifier: v.string() },
  returns: v.union(
    v.object({ allowed: v.literal(true) }),
    v.object({ allowed: v.literal(false), retryAfterMs: v.number() }),
  ),
  handler: async (ctx, args) => {
    const row = await recordOf(ctx, args.kind, args.identifier);
    const result = countAttempt(row, Date.now());
    if (!result.allowed) {
      return { allowed: false as const, retryAfterMs: result.retryAfterMs };
    }
    if (row) await ctx.db.patch(row._id, result.next);
    else {
      await ctx.db.insert("authAttempts", {
        kind: args.kind,
        identifier: normalizeIdentifier(args.identifier),
        ...result.next,
      });
    }
    return { allowed: true as const };
  },
});

/** A successful sign-in wipes the identifier's failures. */
export const clear = internalMutation({
  args: { kind: attemptKind, identifier: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await recordOf(ctx, args.kind, args.identifier);
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

const PURGE_BATCH = 1000;

/**
 * Drops the records left alone long enough to be forgotten, so identifiers
 * tried once do not pile up; a full batch runs again until none is left.
 */
export const purge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const forgotten = await ctx.db
      .query("authAttempts")
      .withIndex("by_last_attempt", (q) =>
        q.lt("lastAttemptAt", Date.now() - ATTEMPTS_FORGOTTEN_AFTER_MS),
      )
      .take(PURGE_BATCH);
    // The longest wait is shorter than that, so none is still running.
    await Promise.all(forgotten.map((row) => ctx.db.delete(row._id)));
    if (forgotten.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.authAttempts.purge, {});
    }
    return null;
  },
});
