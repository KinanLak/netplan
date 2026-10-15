import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { editorAction, readerQuery } from "./lib/functions";
import { readImageHeader } from "./lib/imageHeader";
import { OVERLAY_MAX_IMAGE_SIDE } from "../src/map-engine/overlay";

// Calque files (ADR 0024). The browser rasterizes every import to PNG or
// JPEG; this action checks the bytes before anything lands in storage.

export const OVERLAY_MAX_FILE_BYTES = 15 * 1024 * 1024;
const OVERLAY_FILE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 200;
const DELETE_BATCH_SIZE = 50;

export type OverlayUploadErrorCode =
  | "overlay-file-too-large"
  | "overlay-file-not-image"
  | "overlay-image-too-large";

const uploadError = (code: OverlayUploadErrorCode) => new ConvexError({ code });

const overlayFileResult = v.object({
  fileId: v.string(),
  width: v.number(),
  height: v.number(),
});

export const upload = editorAction({
  args: { bytes: v.bytes(), name: v.string() },
  returns: overlayFileResult,
  handler: async (ctx, { bytes, name }) => {
    if (bytes.byteLength > OVERLAY_MAX_FILE_BYTES) {
      throw uploadError("overlay-file-too-large");
    }
    const header = readImageHeader(new Uint8Array(bytes));
    if (!header) throw uploadError("overlay-file-not-image");
    if (
      header.width < 1 ||
      header.height < 1 ||
      header.width > OVERLAY_MAX_IMAGE_SIDE ||
      header.height > OVERLAY_MAX_IMAGE_SIDE
    ) {
      throw uploadError("overlay-image-too-large");
    }

    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: header.contentType }),
    );
    try {
      const fileId: string = await ctx.runMutation(
        internal.floorOverlays.recordFile,
        {
          storageId,
          name: name.trim().slice(0, MAX_NAME_LENGTH),
          contentType: header.contentType,
          width: header.width,
          height: header.height,
          size: bytes.byteLength,
          createdBy: ctx.user.id,
        },
      );
      return { fileId, width: header.width, height: header.height };
    } catch (error) {
      // Without its row, the daily cleanup would never find this file.
      await ctx.storage.delete(storageId);
      throw error;
    }
  },
});

export const recordFile = internalMutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.union(v.literal("image/png"), v.literal("image/jpeg")),
    width: v.number(),
    height: v.number(),
    size: v.number(),
    createdBy: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const objectId = `overlay-file:${crypto.randomUUID()}`;
    await ctx.db.insert("floorOverlayFiles", {
      ...args,
      objectId,
      createdAt: now,
      // Unused until a calque places it, so an abandoned import is cleaned up.
      releasedAt: now,
    });
    return objectId;
  },
});

export const imageUrl = readerQuery({
  args: { fileId: v.string() },
  returns: v.union(v.null(), v.object({ url: v.string(), name: v.string() })),
  handler: async (ctx, { fileId }) => {
    const file = await ctx.db
      .query("floorOverlayFiles")
      .withIndex("by_object_id", (q) => q.eq("objectId", fileId))
      .unique();
    if (!file) return null;
    const url = await ctx.storage.getUrl(file.storageId);
    return url ? { url, name: file.name } : null;
  },
});

export const deleteReleasedFiles = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - OVERLAY_FILE_RETENTION_MS;
    // `gte(0)` skips files in use, whose `releasedAt` is unset.
    const files = await ctx.db
      .query("floorOverlayFiles")
      .withIndex("by_released", (q) =>
        q.gte("releasedAt", 0).lt("releasedAt", cutoff),
      )
      .take(DELETE_BATCH_SIZE);
    for (const file of files) {
      const user = await ctx.db
        .query("floorOverlays")
        .withIndex("by_file", (q) => q.eq("fileId", file.objectId))
        .first();
      if (user) {
        await ctx.db.patch(file._id, { releasedAt: undefined });
        continue;
      }
      await ctx.storage.delete(file.storageId);
      await ctx.db.delete(file._id);
    }
    if (files.length === DELETE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.floorOverlays.deleteReleasedFiles,
        {},
      );
    }
    return null;
  },
});
