import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const STALE_AFTER_MS = 30_000;

const position = v.object({ x: v.number(), y: v.number() });

const presenceShape = v.object({
  _id: v.id("presences"),
  _creationTime: v.number(),
  sessionId: v.string(),
  displayName: v.string(),
  colorHue: v.number(),
  floorId: v.optional(v.id("floors")),
  cursor: v.optional(position),
  selectedDeviceId: v.optional(v.id("devices")),
  updatedAt: v.number(),
});

export const updateCursor = mutation({
  args: {
    sessionId: v.string(),
    displayName: v.string(),
    colorHue: v.number(),
    floorId: v.optional(v.id("floors")),
    cursor: v.optional(position),
    selectedDeviceId: v.optional(v.id("devices")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("presences")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    const updatedAt = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        colorHue: args.colorHue,
        floorId: args.floorId,
        cursor: args.cursor,
        selectedDeviceId: args.selectedDeviceId,
        updatedAt,
      });
    } else {
      await ctx.db.insert("presences", {
        sessionId: args.sessionId,
        displayName: args.displayName,
        colorHue: args.colorHue,
        floorId: args.floorId,
        cursor: args.cursor,
        selectedDeviceId: args.selectedDeviceId,
        updatedAt,
      });
    }
    return null;
  },
});

export const remove = mutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("presences")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const listForFloor = query({
  args: { floorId: v.id("floors") },
  returns: v.array(presenceShape),
  handler: async (ctx, { floorId }): Promise<Array<Doc<"presences">>> => {
    const presences = await ctx.db
      .query("presences")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    const cutoff = Date.now() - STALE_AFTER_MS;
    return presences.filter((presence) => presence.updatedAt >= cutoff);
  },
});
