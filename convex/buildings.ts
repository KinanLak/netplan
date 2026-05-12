import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const buildingValidator = v.object({
  id: v.string(),
  name: v.string(),
  order: v.number(),
});

const DEFAULT_BUILDING_ID = "building:default";
const DEFAULT_FLOORS = [
  { objectId: "floor:default:rdc", name: "RDC", order: 0 },
  { objectId: "floor:default:etage-1", name: "Étage 1", order: 1 },
];

const defaultMapResult = v.object({
  buildingId: v.string(),
  floorIds: v.array(v.string()),
});

const toBuilding = (row: Doc<"buildings">) => ({
  id: row.objectId,
  name: row.name,
  order: row.order,
});

const getBuildingRow = async (ctx: MutationCtx, objectId: string) => {
  return await ctx.db
    .query("buildings")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();
};

export const list = query({
  args: {},
  returns: v.array(buildingValidator),
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    return buildings.sort((a, b) => a.order - b.order).map(toBuilding);
  },
});

export const create = mutation({
  args: { objectId: v.string(), name: v.string() },
  returns: v.string(),
  handler: async (ctx, { objectId, name }) => {
    const existing = await getBuildingRow(ctx, objectId);
    if (existing) return existing.objectId;

    const buildings = await ctx.db.query("buildings").collect();
    const maxOrder = Math.max(...buildings.map((b) => b.order), -1);
    const order = maxOrder + 1;
    await ctx.db.insert("buildings", { objectId, name, order });
    return objectId;
  },
});

export const createDefaultMap = mutation({
  args: {},
  returns: defaultMapResult,
  handler: async (ctx) => {
    const existingBuilding = await getBuildingRow(ctx, DEFAULT_BUILDING_ID);
    if (!existingBuilding) {
      await ctx.db.insert("buildings", {
        objectId: DEFAULT_BUILDING_ID,
        name: "Bâtiment Principal",
        order: 0,
      });
    }

    for (const floor of DEFAULT_FLOORS) {
      const existingFloor = await ctx.db
        .query("floors")
        .withIndex("by_object_id", (q) => q.eq("objectId", floor.objectId))
        .unique();
      if (existingFloor) continue;

      await ctx.db.insert("floors", {
        objectId: floor.objectId,
        buildingId: DEFAULT_BUILDING_ID,
        name: floor.name,
        order: floor.order,
      });
    }

    return {
      buildingId: DEFAULT_BUILDING_ID,
      floorIds: DEFAULT_FLOORS.map((floor) => floor.objectId),
    };
  },
});

export const clearMap = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const links = await ctx.db.query("links").collect();
    for (const link of links) await ctx.db.delete(link._id);

    const devices = await ctx.db.query("devices").collect();
    for (const device of devices) await ctx.db.delete(device._id);

    const walls = await ctx.db.query("walls").collect();
    for (const wall of walls) await ctx.db.delete(wall._id);

    const floors = await ctx.db.query("floors").collect();
    for (const floor of floors) await ctx.db.delete(floor._id);

    const buildings = await ctx.db.query("buildings").collect();
    for (const building of buildings) await ctx.db.delete(building._id);

    const presences = await ctx.db.query("presences").collect();
    for (const presence of presences) await ctx.db.delete(presence._id);

    const operations = await ctx.db.query("clientOperations").collect();
    for (const operation of operations) await ctx.db.delete(operation._id);

    return null;
  },
});

export const rename = mutation({
  args: { id: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const building = await getBuildingRow(ctx, id);
    if (!building) throw new ConvexError("Building not found");
    await ctx.db.patch(building._id, { name });
    return null;
  },
});

export const remove = internalMutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const building = await getBuildingRow(ctx, id);
    if (!building) throw new ConvexError("Building not found");
    const floors = await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", id))
      .collect();
    for (const floor of floors) {
      await cascadeRemoveFloor(ctx, floor.objectId);
    }
    await ctx.db.delete(building._id);
    return null;
  },
});

export async function cascadeRemoveFloor(ctx: MutationCtx, floorId: string) {
  const floor = await ctx.db
    .query("floors")
    .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
    .unique();
  if (!floor) return;

  const links = await ctx.db
    .query("links")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const link of links) await ctx.db.delete(link._id);

  const devices = await ctx.db
    .query("devices")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  const deviceIds = new Set(devices.map((device) => device.objectId));

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

  for (const device of devices) await ctx.db.delete(device._id);

  const walls = await ctx.db
    .query("walls")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const wall of walls) await ctx.db.delete(wall._id);

  await ctx.db.delete(floor._id);
}
