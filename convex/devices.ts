import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { device } from "./mapValidators";

const toDevice = (row: Doc<"devices">) => ({
  id: row.objectId,
  floorId: row.floorId,
  type: row.type,
  name: row.name,
  hostname: row.hostname,
  position: row.position,
  size: row.size,
  metadata: row.metadata,
});

export const listForFloor = query({
  args: { floorId: v.string() },
  returns: v.array(device),
  handler: async (ctx, { floorId }) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    return devices.map(toDevice);
  },
});
