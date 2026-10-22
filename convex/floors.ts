import { ConvexError, v } from "convex/values";
import { readerQuery, editorMutation } from "./lib/functions";
import type { Doc } from "./_generated/dataModel";
import { describeContent } from "../src/buildings/content";
import {
  buildingRow,
  checkedName,
  deleteEmptyFloor,
  floorContent,
  floorRow,
  floorsOf,
} from "./lib/structure";

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

export const listForBuilding = readerQuery({
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

export const listAll = readerQuery({
  args: {},
  returns: v.array(floorValidator),
  handler: async (ctx) => {
    const floors = await ctx.db.query("floors").collect();
    return floors.map(toFloor);
  },
});

/** A floor above the building's others. Retrying with the same id returns it. */
export const create = editorMutation({
  args: {
    objectId: v.string(),
    buildingId: v.string(),
    name: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { objectId, buildingId, name }) => {
    const building = await buildingRow(ctx, buildingId);
    if (!building) throw new ConvexError("Ce bâtiment n'existe plus.");

    const existing = await floorRow(ctx, objectId);
    if (existing) {
      if (existing.buildingId !== buildingId) {
        throw new ConvexError("Cet identifiant d'étage est déjà pris.");
      }
      return existing.objectId;
    }

    const siblings = await floorsOf(ctx, buildingId);
    const checked = checkedName("floor", name, siblings);
    const order = Math.max(...siblings.map((f) => f.order), -1) + 1;
    await ctx.db.insert("floors", {
      objectId,
      buildingId,
      name: checked,
      order,
    });
    return objectId;
  },
});

export const rename = editorMutation({
  args: { id: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const floor = await floorRow(ctx, id);
    if (!floor) throw new ConvexError("Cet étage n'existe plus.");
    const others = (await floorsOf(ctx, floor.buildingId)).filter(
      (other) => other._id !== floor._id,
    );
    await ctx.db.patch(floor._id, {
      name: checkedName("floor", name, others),
    });
    return null;
  },
});

/** Only an empty floor goes: a user takes its devices, walls and calque off first. */
export const remove = editorMutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const floor = await floorRow(ctx, id);
    if (!floor) return null;
    const content = describeContent(await floorContent(ctx, id));
    if (content) {
      throw new ConvexError(
        `L'étage « ${floor.name} » porte encore ${content} : videz-le avant de le supprimer.`,
      );
    }
    await deleteEmptyFloor(ctx, floor);
    return null;
  },
});

const contentValidator = v.object({
  devices: v.number(),
  wallBlocks: v.number(),
  overlays: v.number(),
});

/** What stands on a floor, so its removal says why it cannot happen yet. */
export const content = readerQuery({
  args: { id: v.string() },
  returns: v.union(contentValidator, v.null()),
  handler: async (ctx, { id }) => {
    const floor = await floorRow(ctx, id);
    return floor ? await floorContent(ctx, id) : null;
  },
});

/**
 * Swaps a floor with its neighbour above or below, the order the sidebar
 * shows, top floor first. A floor already at that end stays.
 */
export const move = editorMutation({
  args: {
    id: v.string(),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  returns: v.null(),
  handler: async (ctx, { id, direction }) => {
    const floor = await floorRow(ctx, id);
    if (!floor) throw new ConvexError("Cet étage n'existe plus.");
    const siblings = (await floorsOf(ctx, floor.buildingId)).toSorted(
      (a, b) => a.order - b.order,
    );
    const index = siblings.findIndex((other) => other._id === floor._id);
    const target = direction === "up" ? index + 1 : index - 1;
    if (target < 0 || target >= siblings.length) return null;
    const neighbour = siblings[target];
    await ctx.db.patch(floor._id, { order: neighbour.order });
    await ctx.db.patch(neighbour._id, { order: floor.order });
    return null;
  },
});
