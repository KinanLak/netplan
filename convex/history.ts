// Thirty days of what the network observed (ADRs 0014 and 0027). The
// LibreNMS step writes events through the helpers below; Éditeurs and Admins
// read them, and a daily cron forgets what is older than 30 days.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { editorQuery } from "./lib/functions";
import { deviceEventKind, publicDeviceEvent } from "./historyValidators";
import type { historyPlace } from "./historyValidators";

export const RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Rows one purge mutation deletes per table before it schedules the next. */
const PURGE_BATCH = 500;

export type HistoryPlace = Infer<typeof historyPlace>;
type DeviceEventKind = Infer<typeof deviceEventKind>;

/** `read`, asked at most once per id. */
const cached = <Row>(read: (id: string) => Promise<Row>) => {
  const rows = new Map<string, Promise<Row>>();
  return (id: string) => {
    let row = rows.get(id);
    if (!row) {
      row = read(id);
      rows.set(id, row);
    }
    return row;
  };
};

/**
 * Names the places sightings point at, reading each device, port, floor and
 * building once per cycle however many devices were seen there.
 */
export const placeNamer = (ctx: QueryCtx) => {
  const device = cached(
    async (id) =>
      await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", id))
        .unique(),
  );
  const port = cached(
    async (id) =>
      await ctx.db
        .query("ports")
        .withIndex("by_object_id", (q) => q.eq("objectId", id))
        .unique(),
  );
  const floor = cached(
    async (id) =>
      await ctx.db
        .query("floors")
        .withIndex("by_object_id", (q) => q.eq("objectId", id))
        .unique(),
  );
  const building = cached(
    async (id) =>
      await ctx.db
        .query("buildings")
        .withIndex("by_object_id", (q) => q.eq("objectId", id))
        .unique(),
  );

  return async ({
    switchId,
    portId,
    socketId,
  }: {
    switchId: string;
    portId: string;
    socketId?: string;
  }): Promise<HistoryPlace> => {
    const place: HistoryPlace = {
      switchId,
      switchName: (await device(switchId))?.name ?? switchId,
      portId,
      portName: (await port(portId))?.name ?? portId,
    };
    if (socketId === undefined) return place;
    const socket = await device(socketId);
    const floorId = socket?.placement?.floorId;
    const onFloor = floorId === undefined ? null : await floor(floorId);
    const inBuilding = onFloor ? await building(onFloor.buildingId) : null;
    return {
      ...place,
      socketId,
      socketName: socket?.name ?? socketId,
      ...(onFloor && { floorId: onFloor.objectId, floorName: onFloor.name }),
      ...(inBuilding && { buildingName: inBuilding.name }),
    };
  };
};

/** Records that the network saw `device` at `place`. */
export const recordLocated = async (
  ctx: MutationCtx,
  device: Doc<"devices">,
  place: HistoryPlace,
  at: number,
) => {
  await ctx.db.insert("deviceEvents", {
    siteId: device.siteId,
    deviceId: device.objectId,
    deviceName: device.name,
    at,
    kind: "located",
    place,
  });
};

/**
 * Records that `device` came online or went offline, unless its previous
 * presence event already says so: a status cleared because its read grew old
 * and set again is no change.
 */
export const recordPresence = async (
  ctx: MutationCtx,
  device: Doc<"devices">,
  kind: Exclude<DeviceEventKind, "located">,
  at: number,
  lastSeenAt?: number,
) => {
  const previous = await ctx.db
    .query("deviceEvents")
    .withIndex("by_device_at", (q) => q.eq("deviceId", device.objectId))
    .order("desc")
    .filter((q) => q.neq(q.field("kind"), "located"))
    .first();
  if (previous?.kind === kind) return;
  await ctx.db.insert("deviceEvents", {
    siteId: device.siteId,
    deviceId: device.objectId,
    deviceName: device.name,
    at,
    kind,
    ...(lastSeenAt !== undefined && { lastSeenAt }),
  });
};

const toPublicEvent = ({
  siteId,
  deviceId,
  deviceName,
  at,
  kind,
  place,
  lastSeenAt,
}: Doc<"deviceEvents">): Infer<typeof publicDeviceEvent> => ({
  siteId,
  deviceId,
  deviceName,
  at,
  kind,
  ...(place && { place }),
  ...(lastSeenAt !== undefined && { lastSeenAt }),
});

const eventPage = paginationResultValidator(publicDeviceEvent);

/** A device's history, newest first. */
export const forDevice = editorQuery({
  args: { deviceId: v.string(), paginationOpts: paginationOptsValidator },
  returns: eventPage,
  handler: async (ctx, { deviceId, paginationOpts }) => {
    const result = await ctx.db
      .query("deviceEvents")
      .withIndex("by_device_at", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(toPublicEvent) };
  },
});

/** A site's history, newest first, of one kind of event or all. */
export const forSite = editorQuery({
  args: {
    siteId: v.string(),
    kind: v.optional(deviceEventKind),
    paginationOpts: paginationOptsValidator,
  },
  returns: eventPage,
  handler: async (ctx, { siteId, kind, paginationOpts }) => {
    const ordered = ctx.db
      .query("deviceEvents")
      .withIndex("by_site_at", (q) => q.eq("siteId", siteId))
      .order("desc");
    const result = await (
      kind === undefined
        ? ordered
        : ordered.filter((q) => q.eq(q.field("kind"), kind))
    ).paginate(paginationOpts);
    return { ...result, page: result.page.map(toPublicEvent) };
  },
});

/**
 * Deletes history older than 30 days, a batch at a time, and schedules
 * itself again while some remains. Current state is never touched.
 */
export const purge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const before = Date.now() - RETENTION_MS;
    const old = await ctx.db
      .query("deviceEvents")
      .withIndex("by_at", (q) => q.lt("at", before))
      .take(PURGE_BATCH);
    for (const row of old) await ctx.db.delete(row._id);
    if (old.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.history.purge, {});
    }
    return null;
  },
});
