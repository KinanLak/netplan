import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireSite } from "./sites";

const buildingValidator = v.object({
  id: v.string(),
  siteId: v.string(),
  name: v.string(),
  order: v.number(),
});

const defaultBuildingId = (siteId: string) => `building:${siteId}:default`;
const defaultFloors = (siteId: string) => [
  { objectId: `floor:${siteId}:default:rdc`, name: "RDC", order: 0 },
  {
    objectId: `floor:${siteId}:default:etage-1`,
    name: "Étage 1",
    order: 1,
  },
];

const defaultMapResult = v.object({
  buildingId: v.string(),
  floorIds: v.array(v.string()),
});

const toBuilding = (row: Doc<"buildings">) => ({
  id: row.objectId,
  siteId: row.siteId,
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

export const listForSite = query({
  args: { siteId: v.string() },
  returns: v.array(buildingValidator),
  handler: async (ctx, { siteId }) => {
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    return buildings.map(toBuilding);
  },
});

export const create = mutation({
  args: { siteId: v.string(), objectId: v.string(), name: v.string() },
  returns: v.string(),
  handler: async (ctx, { siteId, objectId, name }) => {
    await requireSite(ctx, siteId);
    const existing = await getBuildingRow(ctx, objectId);
    if (existing) {
      if (existing.siteId !== siteId) {
        throw new ConvexError("Building identity belongs to another site");
      }
      return existing.objectId;
    }

    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    const maxOrder = Math.max(...buildings.map((b) => b.order), -1);
    const order = maxOrder + 1;
    await ctx.db.insert("buildings", { objectId, siteId, name, order });
    return objectId;
  },
});

export const createDefaultMap = mutation({
  args: { siteId: v.string() },
  returns: defaultMapResult,
  handler: async (ctx, { siteId }) => {
    await requireSite(ctx, siteId);
    const buildingId = defaultBuildingId(siteId);
    const floors = defaultFloors(siteId);
    const existingBuilding = await getBuildingRow(ctx, buildingId);
    if (existingBuilding && existingBuilding.siteId !== siteId) {
      throw new ConvexError(
        "Default building identity belongs to another site",
      );
    }
    if (!existingBuilding) {
      await ctx.db.insert("buildings", {
        objectId: buildingId,
        siteId,
        name: "Bâtiment Principal",
        order: 0,
      });
    }

    for (const floor of floors) {
      const existingFloor = await ctx.db
        .query("floors")
        .withIndex("by_object_id", (q) => q.eq("objectId", floor.objectId))
        .unique();
      if (existingFloor) {
        if (existingFloor.buildingId !== buildingId) {
          throw new ConvexError(
            "Default floor identity belongs to another building",
          );
        }
        continue;
      }

      await ctx.db.insert("floors", {
        objectId: floor.objectId,
        buildingId,
        name: floor.name,
        order: floor.order,
      });
    }

    return {
      buildingId,
      floorIds: floors.map((floor) => floor.objectId),
    };
  },
});

export const clearMap = mutation({
  args: { siteId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId }) => {
    await requireSite(ctx, siteId);
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    for (const building of buildings) {
      const floors = await ctx.db
        .query("floors")
        .withIndex("by_building", (q) => q.eq("buildingId", building.objectId))
        .collect();
      for (const floor of floors) await cascadeRemoveFloor(ctx, floor.objectId);
      await ctx.db.delete(building._id);
    }

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

  const bindings = await ctx.db
    .query("externalObjectBindings")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const binding of bindings) await ctx.db.delete(binding._id);

  const presences = await ctx.db
    .query("presences")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const presence of presences) {
    await ctx.db.delete(presence._id);
  }

  for (const device of devices) await ctx.db.delete(device._id);

  const walls = await ctx.db
    .query("walls")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const wall of walls) await ctx.db.delete(wall._id);

  const revisions = await ctx.db
    .query("documentRevisions")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const revision of revisions) await ctx.db.delete(revision._id);

  const operations = await ctx.db
    .query("clientOperations")
    .filter((q) => q.eq(q.field("floorId"), floorId))
    .collect();
  for (const operation of operations) await ctx.db.delete(operation._id);

  await ctx.db.delete(floor._id);
}
