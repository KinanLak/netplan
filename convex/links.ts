import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getExpiredDeviceIdsForFloor } from "./computerPresentation";
import { link } from "./mapValidators";

const toLink = (row: Doc<"links">) => ({
  id: row.objectId,
  floorId: row.floorId,
  fromDeviceId: row.fromDeviceId,
  fromPort: row.fromPort,
  toDeviceId: row.toDeviceId,
  toPort: row.toPort,
  label: row.label,
});

export const listForFloor = query({
  args: { floorId: v.string() },
  returns: v.array(link),
  handler: async (ctx, { floorId }) => {
    const [links, expiredDeviceIds] = await Promise.all([
      ctx.db
        .query("links")
        .withIndex("by_floor", (q) => q.eq("floorId", floorId))
        .collect(),
      getExpiredDeviceIdsForFloor(ctx, floorId),
    ]);
    return links
      .filter(
        (item) =>
          !expiredDeviceIds.has(item.fromDeviceId) &&
          !expiredDeviceIds.has(item.toDeviceId),
      )
      .map(toLink);
  },
});

export const listForDevice = query({
  args: { deviceId: v.string() },
  returns: v.array(link),
  handler: async (ctx, { deviceId }) => {
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
    for (const item of [...outgoing, ...incoming]) {
      if (seen.has(item.objectId)) continue;
      seen.add(item.objectId);
      merged.push(item);
    }
    return merged.map(toLink);
  },
});
