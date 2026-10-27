import { ConvexError, v } from "convex/values";
import { readerQuery, editorMutation } from "./lib/functions";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { requireOpenSite } from "./sites";
import {
  buildingRow,
  checkedName,
  deleteEmptyFloor,
  floorContent,
  floorRow,
  floorsOf,
} from "./lib/structure";
import {
  EMPTY_CONTENT,
  addContent,
  describeContent,
} from "../src/buildings/content";

const buildingValidator = v.object({
  id: v.string(),
  siteId: v.string(),
  name: v.string(),
  order: v.number(),
});

const toBuilding = (row: Doc<"buildings">) => ({
  id: row.objectId,
  siteId: row.siteId,
  name: row.name,
  order: row.order,
});

export const list = readerQuery({
  args: {},
  returns: v.array(buildingValidator),
  handler: async (ctx) => {
    const buildings = await ctx.db.query("buildings").collect();
    return buildings.sort((a, b) => a.order - b.order).map(toBuilding);
  },
});

export const listForSite = readerQuery({
  args: { siteId: v.string() },
  returns: v.array(buildingValidator),
  handler: async (ctx, { siteId }) => {
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    return buildings.toSorted((a, b) => a.order - b.order).map(toBuilding);
  },
});

const buildingsOf = async (ctx: MutationCtx, siteId: string) =>
  await ctx.db
    .query("buildings")
    .withIndex("by_site", (q) => q.eq("siteId", siteId))
    .collect();

/**
 * A new building, with its first floor when one is named, so the map has
 * somewhere to draw at once. Retrying with the same id returns it.
 */
export const create = editorMutation({
  args: {
    siteId: v.string(),
    objectId: v.string(),
    name: v.string(),
    firstFloor: v.optional(
      v.object({ objectId: v.string(), name: v.string() }),
    ),
  },
  returns: v.string(),
  handler: async (ctx, { siteId, objectId, name, firstFloor }) => {
    await requireOpenSite(ctx, siteId);
    const existing = await buildingRow(ctx, objectId);
    if (existing) {
      if (existing.siteId !== siteId) {
        throw new ConvexError("Cet identifiant de bâtiment est déjà pris.");
      }
      return existing.objectId;
    }

    const buildings = await buildingsOf(ctx, siteId);
    const checked = checkedName("building", name, buildings);
    const floorName = firstFloor && checkedName("floor", firstFloor.name, []);
    if (firstFloor && (await floorRow(ctx, firstFloor.objectId))) {
      throw new ConvexError("Cet identifiant d'étage est déjà pris.");
    }
    const order = Math.max(...buildings.map((b) => b.order), -1) + 1;
    await ctx.db.insert("buildings", {
      objectId,
      siteId,
      name: checked,
      order,
    });
    if (firstFloor && floorName) {
      await ctx.db.insert("floors", {
        objectId: firstFloor.objectId,
        buildingId: objectId,
        name: floorName,
        order: 0,
      });
    }
    return objectId;
  },
});

export const rename = editorMutation({
  args: { id: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, name }) => {
    const building = await buildingRow(ctx, id);
    if (!building) throw new ConvexError("Ce bâtiment n'existe plus.");
    await requireOpenSite(ctx, building.siteId);
    const others = (await buildingsOf(ctx, building.siteId)).filter(
      (other) => other._id !== building._id,
    );
    await ctx.db.patch(building._id, {
      name: checkedName("building", name, others),
    });
    return null;
  },
});

/** Only an empty building goes, with its empty floors. */
export const remove = editorMutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const building = await buildingRow(ctx, id);
    if (!building) return null;
    await requireOpenSite(ctx, building.siteId);
    const floors = await floorsOf(ctx, id);
    for (const floor of floors) {
      const content = describeContent(await floorContent(ctx, floor.objectId));
      if (content) {
        throw new ConvexError(
          `Le bâtiment « ${building.name} » n'est pas vide : l'étage « ${floor.name} » porte encore ${content}.`,
        );
      }
    }
    for (const floor of floors) await deleteEmptyFloor(ctx, floor);
    await ctx.db.delete(building._id);
    return null;
  },
});

/** What stands on every floor of a building, for its removal dialog. */
export const content = readerQuery({
  args: { id: v.string() },
  returns: v.union(
    v.object({
      devices: v.number(),
      wallBlocks: v.number(),
      overlays: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    const building = await buildingRow(ctx, id);
    if (!building) return null;
    let total = EMPTY_CONTENT;
    for (const floor of await floorsOf(ctx, id)) {
      total = addContent(total, await floorContent(ctx, floor.objectId));
    }
    return total;
  },
});
