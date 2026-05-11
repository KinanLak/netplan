import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { cascadeRemoveFloor } from "./buildings";

export const listForBuilding = query({
  args: { buildingId: v.id("buildings") },
  returns: v.array(
    v.object({
      _id: v.id("floors"),
      _creationTime: v.number(),
      buildingId: v.id("buildings"),
      name: v.string(),
      order: v.number(),
    }),
  ),
  handler: async (ctx, { buildingId }): Promise<Array<Doc<"floors">>> => {
    return await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
  },
});

export const create = mutation({
  args: {
    buildingId: v.id("buildings"),
    name: v.string(),
  },
  returns: v.id("floors"),
  handler: async (ctx, { buildingId, name }): Promise<Id<"floors">> => {
    const siblings = await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
      .collect();
    const maxOrder = Math.max(
      ...siblings.map((f) => (typeof f.order === "number" ? f.order : -1)),
      -1,
    );
    const order = maxOrder + 1;
    return await ctx.db.insert("floors", { buildingId, name, order });
  },
});

export const rename = mutation({
  args: { id: v.id("floors"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    await ctx.db.patch(id, { name });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("floors") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await cascadeRemoveFloor(ctx, id);
    return null;
  },
});
