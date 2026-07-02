import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { device, link, wallSegment } from "./mapValidators";

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

export const getFloorDevices = query({
  args: { floorId: v.string() },
  returns: v.array(device),
  handler: async (ctx, { floorId }) => {
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    return rows.map(toDevice);
  },
});

export const getFloorWalls = query({
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

export const getFloorLinks = query({
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

export const getFloorRevision = query({
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
