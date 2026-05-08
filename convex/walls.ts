import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const wallColor = v.union(
  v.literal("sand"),
  v.literal("concrete"),
  v.literal("slate"),
);

const position = v.object({ x: v.number(), y: v.number() });

const wallSegmentInput = v.object({
  start: position,
  end: position,
  color: wallColor,
});

export const listForFloor = query({
  args: { floorId: v.id("floors") },
  handler: async (ctx, { floorId }): Promise<Array<Doc<"walls">>> => {
    return await ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
  },
});

export const addStroke = mutation({
  args: {
    floorId: v.id("floors"),
    segments: v.array(wallSegmentInput),
  },
  returns: v.array(v.id("walls")),
  handler: async (ctx, { floorId, segments }): Promise<Array<Id<"walls">>> => {
    const ids: Array<Id<"walls">> = [];
    for (const segment of segments) {
      const id = await ctx.db.insert("walls", { floorId, ...segment });
      ids.push(id);
    }
    return ids;
  },
});

export const eraseStroke = mutation({
  args: {
    floorId: v.id("floors"),
    removeIds: v.array(v.id("walls")),
  },
  returns: v.null(),
  handler: async (ctx, { floorId, removeIds }) => {
    for (const id of removeIds) {
      const wall = await ctx.db.get(id);
      if (wall !== null && wall.floorId === floorId) {
        await ctx.db.delete(id);
      }
    }
    return null;
  },
});

export const removeAll = mutation({
  args: { floorId: v.id("floors") },
  returns: v.null(),
  handler: async (ctx, { floorId }) => {
    const walls = await ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    for (const wall of walls) await ctx.db.delete(wall._id);
    return null;
  },
});
