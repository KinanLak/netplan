// Buildings and floors: names checked once for both, and removal limited to
// empty floors, so a removal never takes a drawing with it (ADR 0026).
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { StructureContent } from "../../src/buildings/content";
import {
  normalizeStructureName,
  sameStructureName,
  structureNameError,
} from "../../src/buildings/names";
import type { StructureKind } from "../../src/buildings/names";

/**
 * The name to store, refused when unusable or when a sibling already
 * carries it.
 */
export function checkedName(
  kind: StructureKind,
  raw: string,
  siblings: ReadonlyArray<{ name: string }>,
): string {
  const name = normalizeStructureName(raw);
  const error = structureNameError(kind, name);
  if (error) throw new ConvexError(error);
  if (siblings.some((sibling) => sameStructureName(sibling.name, name))) {
    throw new ConvexError(
      kind === "building"
        ? `Ce site a déjà un bâtiment « ${name} ».`
        : `Ce bâtiment a déjà un étage « ${name} ».`,
    );
  }
  return name;
}

export const buildingRow = async (ctx: QueryCtx, objectId: string) =>
  await ctx.db
    .query("buildings")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

export const floorRow = async (ctx: QueryCtx, objectId: string) =>
  await ctx.db
    .query("floors")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

export const floorsOf = async (ctx: QueryCtx, buildingId: string) =>
  await ctx.db
    .query("floors")
    .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
    .collect();

/** What still stands on a floor, counted. */
export async function floorContent(
  ctx: QueryCtx,
  floorId: string,
): Promise<StructureContent> {
  const [devices, walls, overlays] = await Promise.all([
    ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .collect(),
    ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect(),
    ctx.db
      .query("floorOverlays")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect(),
  ]);
  return {
    devices: devices.length,
    wallBlocks: walls.length,
    overlays: overlays.length,
  };
}

/**
 * Removes a floor known to be empty, with what only described it: who was
 * looking at it and its revision. Operation receipts stay: they are keyed by
 * operation, so a retried operation still finds its answer.
 */
export async function deleteEmptyFloor(ctx: MutationCtx, floor: Doc<"floors">) {
  const floorId = floor.objectId;
  const presences = await ctx.db
    .query("presences")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const presence of presences) await ctx.db.delete(presence._id);

  const revisions = await ctx.db
    .query("documentRevisions")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const revision of revisions) await ctx.db.delete(revision._id);

  await ctx.db.delete(floor._id);
}
