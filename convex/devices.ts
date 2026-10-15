import { v } from "convex/values";
import { readerQuery } from "./lib/functions";
import { toPublicDevice } from "./mapDocument";
import { device } from "./mapValidators";

export const listForFloor = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(device),
  handler: async (ctx, { floorId }) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    return devices.map(toPublicDevice);
  },
});
