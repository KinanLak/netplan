import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

const deviceType = v.union(
  v.literal("rack"),
  v.literal("switch"),
  v.literal("pc"),
  v.literal("wall-port"),
);

const deviceStatus = v.union(
  v.literal("up"),
  v.literal("down"),
  v.literal("unknown"),
);

const position = v.object({ x: v.number(), y: v.number() });
const size = v.object({ width: v.number(), height: v.number() });

const portInfo = v.object({
  id: v.string(),
  number: v.number(),
  status: deviceStatus,
});

const deviceMetadata = v.object({
  ip: v.optional(v.string()),
  status: v.optional(deviceStatus),
  model: v.optional(v.string()),
  ports: v.optional(v.array(portInfo)),
  lastUser: v.optional(v.string()),
});

export const listForFloor = query({
  args: { floorId: v.id("floors") },
  handler: async (ctx, { floorId }): Promise<Array<Doc<"devices">>> => {
    return await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
  },
});

export const create = mutation({
  args: {
    floorId: v.id("floors"),
    type: deviceType,
    name: v.string(),
    hostname: v.optional(v.string()),
    position,
    size,
    metadata: deviceMetadata,
  },
  returns: v.id("devices"),
  handler: async (ctx, args): Promise<Id<"devices">> => {
    return await ctx.db.insert("devices", args);
  },
});

export const updatePosition = mutation({
  args: {
    id: v.id("devices"),
    position,
  },
  returns: v.null(),
  handler: async (ctx, { id, position: nextPosition }) => {
    await ctx.db.patch(id, { position: nextPosition });
    return null;
  },
});

export const rename = mutation({
  args: {
    id: v.id("devices"),
    name: v.string(),
    hostname: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, hostname }) => {
    await ctx.db.patch(id, { name, hostname });
    return null;
  },
});

export const updateMetadata = mutation({
  args: {
    id: v.id("devices"),
    metadata: deviceMetadata,
  },
  returns: v.null(),
  handler: async (ctx, { id, metadata }) => {
    await ctx.db.patch(id, { metadata });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const incoming = await ctx.db
      .query("links")
      .withIndex("by_to_device", (q) => q.eq("toDeviceId", id))
      .collect();
    for (const link of incoming) await ctx.db.delete(link._id);
    const outgoing = await ctx.db
      .query("links")
      .withIndex("by_from_device", (q) => q.eq("fromDeviceId", id))
      .collect();
    for (const link of outgoing) await ctx.db.delete(link._id);
    await ctx.db.delete(id);
    return null;
  },
});
