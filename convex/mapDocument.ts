import { v } from "convex/values";
import { readerQuery } from "./lib/functions";
import { device, floorOverlay, link, wallSegment } from "./mapValidators";
import type { Doc } from "./_generated/dataModel";

// MAC addresses stay server-side until the inventory decides who sees them.
export const toPublicDevice = (row: Doc<"devices">) => {
  const { macs: _macs, ...metadata } = row.metadata;
  return {
    id: row.objectId,
    floorId: row.floorId,
    type: row.type,
    name: row.name,
    hostname: row.hostname,
    position: row.position,
    size: row.size,
    metadata,
  };
};

const toWall = (row: Doc<"walls">) => ({
  id: row.objectId,
  floorId: row.floorId,
  start: row.start,
  end: row.end,
  color: row.color,
  geometryKey: row.geometryKey,
});

const toLink = (row: Doc<"links">) => ({
  id: row.objectId,
  floorId: row.floorId,
  fromDeviceId: row.fromDeviceId,
  fromPort: row.fromPort,
  toDeviceId: row.toDeviceId,
  toPort: row.toPort,
  label: row.label,
});

// The floor document is split into one query per collection so an edit only
// re-sends the collection it touched to subscribed clients (moving a device
// does not re-transmit every wall). Convex updates all subscribed queries at
// the same logical timestamp, so the combined snapshot stays consistent.

export const getFloorDevices = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(device),
  handler: async (ctx, { floorId }) => {
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    return rows.map(toPublicDevice);
  },
});

export const getFloorWalls = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(wallSegment),
  handler: async (ctx, { floorId }) => {
    const rows = await ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    return rows.map(toWall);
  },
});

export const getFloorLinks = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(link),
  handler: async (ctx, { floorId }) => {
    const rows = await ctx.db
      .query("links")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    return rows.map(toLink);
  },
});

export const getFloorRevision = readerQuery({
  args: { floorId: v.string() },
  returns: v.number(),
  handler: async (ctx, { floorId }) => {
    const revision = await ctx.db
      .query("documentRevisions")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .unique();
    return revision?.revision ?? 0;
  },
});

export const getFloorOverlay = readerQuery({
  args: { floorId: v.string() },
  returns: v.union(v.null(), floorOverlay),
  handler: async (ctx, { floorId }) => {
    const row = await ctx.db
      .query("floorOverlays")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .unique();
    if (!row) return null;
    return {
      floorId: row.floorId,
      fileId: row.fileId,
      imageWidth: row.imageWidth,
      imageHeight: row.imageHeight,
      center: row.center,
      scale: row.scale,
      rotation: row.rotation,
      opacity: row.opacity,
      locked: row.locked,
    };
  },
});
