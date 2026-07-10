import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { cascadeRemoveFloor } from "./buildings";

const floorValidator = v.object({
  id: v.string(),
  buildingId: v.string(),
  name: v.string(),
  order: v.number(),
});

const toFloor = (row: Doc<"floors">) => ({
  id: row.objectId,
  buildingId: row.buildingId,
  name: row.name,
  order: row.order,
});

export const listForBuilding = query({
  args: { buildingId: v.string() },
  returns: v.array(floorValidator),
  handler: async (ctx, { buildingId }) => {
    const floors = await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
    return floors.map(toFloor);
  },
});

export const listAll = query({
  args: {},
  returns: v.array(floorValidator),
  handler: async (ctx) => {
    const floors = await ctx.db.query("floors").collect();
    return floors.map(toFloor);
  },
});

export const create = mutation({
  args: {
    objectId: v.string(),
    buildingId: v.string(),
    name: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { objectId, buildingId, name }) => {
    const building = await ctx.db
      .query("buildings")
      .withIndex("by_object_id", (q) => q.eq("objectId", buildingId))
      .unique();
    if (!building) throw new ConvexError("Building not found");

    const existing = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
      .unique();
    if (existing) return existing.objectId;

    const siblings = await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
    const maxOrder = Math.max(...siblings.map((f) => f.order), -1);
    const order = maxOrder + 1;
    await ctx.db.insert("floors", { objectId, buildingId, name, order });
    return objectId;
  },
});

export const rename = mutation({
  args: { id: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const floor = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", id))
      .unique();
    if (!floor) throw new ConvexError("Floor not found");
    await ctx.db.patch(floor._id, { name });
    return null;
  },
});

export const remove = internalMutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const floor = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", id))
      .unique();
    if (!floor) throw new ConvexError("Floor not found");
    await cascadeRemoveFloor(ctx, id);
    return null;
  },
});
