import { v } from "convex/values";
import { readerQuery } from "./lib/functions";
import { cableRowsOf, portRowsOf, toCable, toPort } from "./lib/ports";
import {
  cable,
  floorOverlay,
  placedDevice,
  port,
  wallSegment,
} from "./mapValidators";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/**
 * The map's view of a placed device. MAC addresses are shown to every
 * signed-in role, like the rest of the inventory.
 */
export const toPublicDevice = (
  row: Doc<"devices">,
  placement: NonNullable<Doc<"devices">["placement"]>,
) => ({
  id: row.objectId,
  floorId: placement.floorId,
  type: row.type,
  name: row.name,
  hostname: row.hostname,
  serial: row.serial,
  macs: row.macs,
  model: row.model,
  ip: row.ip,
  notes: row.notes,
  source: row.source,
  position: placement.position,
  size: placement.size,
  metadata: row.metadata,
});

/** The devices placed on a floor, as the map reads them. */
export const placedDevicesOf = async (ctx: QueryCtx, floorId: string) => {
  const rows = await ctx.db
    .query("devices")
    .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
    .collect();
  return rows.flatMap((row) =>
    row.placement ? [toPublicDevice(row, row.placement)] : [],
  );
};

const toWall = (row: Doc<"walls">) => ({
  id: row.objectId,
  floorId: row.floorId,
  start: row.start,
  end: row.end,
  color: row.color,
  geometryKey: row.geometryKey,
});

// The floor document is split into one query per collection so an edit only
// re-sends the collection it touched to subscribed clients (moving a device
// does not re-transmit every wall). Convex updates all subscribed queries at
// the same logical timestamp, so the combined snapshot stays consistent.

export const getFloorDevices = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(placedDevice),
  handler: async (ctx, { floorId }) => await placedDevicesOf(ctx, floorId),
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

const placedDeviceIdsOf = async (ctx: QueryCtx, floorId: string) =>
  (
    await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .collect()
  ).map((row) => row.objectId);

/** The ports of the floor's devices. */
export const getFloorPorts = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(port),
  handler: async (ctx, { floorId }) => {
    const deviceIds = await placedDeviceIdsOf(ctx, floorId);
    const rows = await Promise.all(
      deviceIds.map((deviceId) => portRowsOf(ctx, deviceId)),
    );
    return rows.flat().map(toPort);
  },
});

/** The cables with at least one end on the floor, each once. */
export const getFloorCables = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(cable),
  handler: async (ctx, { floorId }) => {
    const deviceIds = await placedDeviceIdsOf(ctx, floorId);
    const rows = await Promise.all(
      deviceIds.map((deviceId) => cableRowsOf(ctx, deviceId)),
    );
    const byId = new Map(rows.flat().map((row) => [row.objectId, row]));
    return [...byId.values()].map(toCable);
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
