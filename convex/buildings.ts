import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("buildings"),
      _creationTime: v.number(),
      name: v.string(),
      order: v.number(),
    }),
  ),
  handler: async (ctx): Promise<Array<Doc<"buildings">>> => {
    const buildings = await ctx.db.query("buildings").collect();
    return buildings.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("buildings"),
  handler: async (ctx, { name }): Promise<Id<"buildings">> => {
    const buildings = await ctx.db.query("buildings").collect();
    const maxOrder = Math.max(
      ...buildings.map((b) => (typeof b.order === "number" ? b.order : -1)),
      -1,
    );
    const order = maxOrder + 1;
    const buildingId = await ctx.db.insert("buildings", { name, order });
    await ctx.db.insert("floors", {
      buildingId,
      name: "Étage 1",
      order: 0,
    });
    return buildingId;
  },
});

export const ensureDefault = mutation({
  args: {},
  returns: v.id("buildings"),
  handler: async (ctx): Promise<Id<"buildings">> => {
    const existing = await ctx.db.query("buildings").first();
    if (existing) return existing._id;

    const buildingId = await ctx.db.insert("buildings", {
      name: "Bâtiment Principal",
      order: 0,
    });
    await ctx.db.insert("floors", {
      buildingId,
      name: "RDC",
      order: 0,
    });
    await ctx.db.insert("floors", {
      buildingId,
      name: "Étage 1",
      order: 1,
    });
    return buildingId;
  },
});

export const rename = mutation({
  args: { id: v.id("buildings"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const building = await ctx.db.get(id);
    if (!building) throw new ConvexError("Building not found");
    await ctx.db.patch(id, { name });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("buildings") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const building = await ctx.db.get(id);
    if (!building) throw new ConvexError("Building not found");
    const floors = await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .collect();
    for (const floor of floors) {
      await cascadeRemoveFloor(ctx, floor._id);
    }
    await ctx.db.delete(id);
    return null;
  },
});

export async function cascadeRemoveFloor(
  ctx: MutationCtx,
  floorId: Id<"floors">,
) {
  const devices = await ctx.db
    .query("devices")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  const linkIds = new Set<Id<"links">>();
  for (const device of devices) {
    const incoming = await ctx.db
      .query("links")
      .withIndex("by_to_device", (q) => q.eq("toDeviceId", device._id))
      .collect();
    for (const link of incoming) linkIds.add(link._id);
    const outgoing = await ctx.db
      .query("links")
      .withIndex("by_from_device", (q) => q.eq("fromDeviceId", device._id))
      .collect();
    for (const link of outgoing) linkIds.add(link._id);
  }
  const deviceIds = new Set<string>(devices.map((device) => device._id));
  const presences = await ctx.db.query("presences").collect();
  for (const presence of presences) {
    if (presence.floorId === floorId) {
      await ctx.db.delete(presence._id);
      continue;
    }
    if (presence.selectedDeviceId && deviceIds.has(presence.selectedDeviceId)) {
      await ctx.db.patch(presence._id, { selectedDeviceId: undefined });
    }
  }
  for (const linkId of linkIds) await ctx.db.delete(linkId);
  for (const device of devices) {
    await ctx.db.delete(device._id);
  }
  const walls = await ctx.db
    .query("walls")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const wall of walls) await ctx.db.delete(wall._id);
  await ctx.db.delete(floorId);
}
