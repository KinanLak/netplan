import { v } from "convex/values";
import { readerQuery } from "./lib/functions";
import {
  cableRowsOf,
  portRowOf,
  portRowsOf,
  toCable,
  toPort,
} from "./lib/ports";
import { PRESENT_TYPES } from "./lib/statuses";
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

const deviceRowOf = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
    .unique();

/** The name of the floor a device stands on; none while it is on no floor. */
const floorNameOf = async (ctx: QueryCtx, device: Doc<"devices">) => {
  const floorId = device.placement?.floorId;
  if (floorId === undefined) return null;
  const floor = await ctx.db
    .query("floors")
    .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
    .unique();
  return floor?.name ?? null;
};

/**
 * What the floor's cable paths need beyond the floor (ADR 0025): the socket
 * where each `pc` or `endpoint` on it was last seen, and the far end of each
 * cable that leaves it, for the label a path ends on.
 */
export const getFloorPathEnds = readerQuery({
  args: { floorId: v.string() },
  returns: v.object({
    seenAt: v.array(
      v.object({
        deviceId: v.string(),
        socketId: v.string(),
        socketName: v.string(),
        floorName: v.union(v.null(), v.string()),
      }),
    ),
    farEnds: v.array(
      v.object({
        portId: v.string(),
        portName: v.string(),
        deviceId: v.string(),
        deviceName: v.string(),
        floorName: v.union(v.null(), v.string()),
      }),
    ),
  }),
  handler: async (ctx, { floorId }) => {
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .collect();
    const onFloor = new Set(rows.map((row) => row.objectId));

    const seenAt = [];
    for (const row of rows) {
      if (!PRESENT_TYPES.has(row.type)) continue;
      // The MAC seen in the fewest cycles ago tells where the device is now.
      let last: Doc<"macSightings"> | null = null;
      for (const mac of row.macs) {
        const sighting = await ctx.db
          .query("macSightings")
          .withIndex("by_site_mac", (q) =>
            q.eq("siteId", row.siteId).eq("mac", mac),
          )
          .unique();
        if (sighting?.socketId === undefined) continue;
        if (
          !last ||
          sighting.misses < last.misses ||
          (sighting.misses === last.misses && sighting.seenAt > last.seenAt)
        ) {
          last = sighting;
        }
      }
      const socket = last?.socketId && (await deviceRowOf(ctx, last.socketId));
      if (!socket) continue;
      seenAt.push({
        deviceId: row.objectId,
        socketId: socket.objectId,
        socketName: socket.name,
        floorName: await floorNameOf(ctx, socket),
      });
    }

    const cables = new Map(
      (await Promise.all(rows.map((row) => cableRowsOf(ctx, row.objectId))))
        .flat()
        .map((row) => [row.objectId, row]),
    );
    const farEnds = [];
    for (const row of cables.values()) {
      const far = !onFloor.has(row.aDeviceId)
        ? row.aPortId
        : !onFloor.has(row.bDeviceId)
          ? row.bPortId
          : null;
      const farPort = far === null ? null : await portRowOf(ctx, far);
      const device = farPort && (await deviceRowOf(ctx, farPort.deviceId));
      if (!farPort || !device) continue;
      farEnds.push({
        portId: farPort.objectId,
        portName: farPort.name,
        deviceId: device.objectId,
        deviceName: device.name,
        floorName: await floorNameOf(ctx, device),
      });
    }
    return { seenAt, farEnds };
  },
});
