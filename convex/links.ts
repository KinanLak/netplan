import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const listForFloor = query({
  args: { floorId: v.id("floors") },
  handler: async (ctx, { floorId }): Promise<Array<Doc<"links">>> => {
    return await ctx.db
      .query("links")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
  },
});

export const listForDevice = query({
  args: { deviceId: v.id("devices") },
  handler: async (ctx, { deviceId }): Promise<Array<Doc<"links">>> => {
    const outgoing = await ctx.db
      .query("links")
      .withIndex("by_from_device", (q) => q.eq("fromDeviceId", deviceId))
      .collect();
    const incoming = await ctx.db
      .query("links")
      .withIndex("by_to_device", (q) => q.eq("toDeviceId", deviceId))
      .collect();
    const seen = new Set<string>();
    const merged: Array<Doc<"links">> = [];
    for (const link of [...outgoing, ...incoming]) {
      if (seen.has(link._id)) continue;
      seen.add(link._id);
      merged.push(link);
    }
    return merged;
  },
});

export const create = mutation({
  args: {
    floorId: v.id("floors"),
    fromDeviceId: v.id("devices"),
    fromPort: v.optional(v.string()),
    toDeviceId: v.id("devices"),
    toPort: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  returns: v.id("links"),
  handler: async (ctx, args): Promise<Id<"links">> => {
    const floor = await ctx.db.get(args.floorId);
    if (!floor) throw new ConvexError("Floor not found");

    const fromDevice = await ctx.db.get(args.fromDeviceId);
    if (!fromDevice) throw new ConvexError("Source device not found");
    const toDevice = await ctx.db.get(args.toDeviceId);
    if (!toDevice) throw new ConvexError("Target device not found");

    if (
      fromDevice.floorId !== args.floorId ||
      toDevice.floorId !== args.floorId
    ) {
      throw new ConvexError("Links must connect devices on the same floor");
    }

    return await ctx.db.insert("links", args);
  },
});

export const remove = mutation({
  args: { id: v.id("links") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const link = await ctx.db.get(id);
    if (!link) throw new ConvexError("Link not found");
    await ctx.db.delete(id);
    return null;
  },
});
