import type { MutationCtx } from "../_generated/server";

/**
 * Marks each file as in use while a calque references it, and as released
 * from `now` once none does, which starts its seven days before deletion.
 */
export async function syncOverlayFileReleases(
  ctx: MutationCtx,
  fileIds: Iterable<string>,
  now: number,
) {
  for (const fileId of new Set(fileIds)) {
    const file = await ctx.db
      .query("floorOverlayFiles")
      .withIndex("by_object_id", (q) => q.eq("objectId", fileId))
      .unique();
    if (!file) continue;
    const user = await ctx.db
      .query("floorOverlays")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .first();
    if (user && file.releasedAt !== undefined) {
      await ctx.db.patch(file._id, { releasedAt: undefined });
    } else if (!user && file.releasedAt === undefined) {
      await ctx.db.patch(file._id, { releasedAt: now });
    }
  }
}
