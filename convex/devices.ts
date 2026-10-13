import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  getComputerPresentationsForFloor,
  getExpiredDeviceIdsForFloor,
  toPublicDevice,
} from "./computerPresentation";
import { device } from "./mapValidators";

export const listForFloor = query({
  args: { floorId: v.string() },
  returns: v.array(device),
  handler: async (ctx, { floorId }) => {
    const [devices, expiredDeviceIds, locations] = await Promise.all([
      ctx.db
        .query("devices")
        .withIndex("by_floor", (q) => q.eq("floorId", floorId))
        .collect(),
      getExpiredDeviceIdsForFloor(ctx, floorId),
      getComputerPresentationsForFloor(ctx, floorId),
    ]);
    return devices
      .filter((row) => !expiredDeviceIds.has(row.objectId))
      .map((row) => toPublicDevice(row, locations.get(row.objectId)));
  },
});
