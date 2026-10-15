import type { MutationCtx } from "../_generated/server";

/** Frees the MAC addresses of a device that leaves the inventory. */
export const deleteDeviceMacs = async (ctx: MutationCtx, deviceId: string) => {
  const rows = await ctx.db
    .query("deviceMacs")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
};
