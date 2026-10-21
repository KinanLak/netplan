// Buildings and floors: names checked once for both, and removal limited to
// empty floors, so a removal never takes a drawing with it (ADR 0026).
import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
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

export const buildingRow = async (ctx: MutationCtx, objectId: string) =>
  await ctx.db
    .query("buildings")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

export const floorRow = async (ctx: MutationCtx, objectId: string) =>
  await ctx.db
    .query("floors")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

export const floorsOf = async (ctx: MutationCtx, buildingId: string) =>
  await ctx.db
    .query("floors")
    .withIndex("by_building", (q) => q.eq("buildingId", buildingId))
    .collect();

/** What still stands on a floor, in words, or null when it is empty. */
export async function floorContent(
  ctx: MutationCtx,
  floorId: string,
): Promise<string | null> {
  const [device, wall, overlay] = await Promise.all([
    ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .first(),
    ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .first(),
    ctx.db
      .query("floorOverlays")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .first(),
  ]);
  const parts = [
    device && "des équipements",
    wall && "des murs",
    overlay && "un calque",
  ].filter((part) => typeof part === "string");
  if (parts.length === 0) return null;
  return parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} et ${parts.at(-1)}`;
}

/**
 * Removes a floor known to be empty, with what only described it: who was
 * looking at it, its revision and its free text labels, which name parts of
 * a floor that is going (C4). Operation receipts stay: they are keyed by
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

  const labels = await ctx.db
    .query("mapLabels")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  for (const label of labels) await ctx.db.delete(label._id);

  await ctx.db.delete(floor._id);
}
