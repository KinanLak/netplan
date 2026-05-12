import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { device, link, wallSegment } from "./mapValidators";

const snapshotValidator = v.object({
  floorId: v.string(),
  devices: v.array(device),
  walls: v.array(wallSegment),
  links: v.array(link),
});

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

export const getFloorDocument = query({
  args: { floorId: v.string() },
  returns: snapshotValidator,
  handler: async (ctx, { floorId }) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    const walls = await ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    const links = await ctx.db
      .query("links")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();

    return {
      floorId,
      devices: devices.map(toDevice),
      walls: walls.map(toWall),
      links: links.map(toLink),
    };
  },
});
