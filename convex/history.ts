// Thirty days of what the network observed (ADRs 0014 and 0027): device
// events and five daily MAC snapshots. The LibreNMS step writes them through
// the helpers below; Éditeurs and Admins read them, and a daily cron forgets
// what is older than 30 days.
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { filter } from "convex-helpers/server/filter";
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { editorQuery } from "./lib/functions";
import { PRESENT_TYPES } from "./lib/statuses";
import {
  deviceEventKind,
  macSighting,
  publicDeviceEvent,
  publicSnapshotEntry,
  publicSnapshotSlot,
} from "./historyValidators";
import type { historyPlace } from "./historyValidators";
import { matchesSearch } from "../src/devices/search";
import { slotAt as snapshotSlotAt } from "../src/sites/snapshots";

export const RETENTION_MS = 30 * 24 * 60 * 60_000;
/** Rows one purge mutation deletes before it schedules the next. */
const PURGE_BATCH = 500;
/** Sightings one snapshot mutation writes. */
export const SNAPSHOT_PAGE = 500;

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

/**
 * Records that the network saw `device` at `place`. With `unlessLast`, a
 * place its last `located` event already names is not recorded again: an
 * arrival, a restored device or the first sighting after an arrival. A move the cycle
 * found against the device's latest sighting is always recorded, even back
 * to the port that event names.
 */
export const recordLocated = async (
  ctx: MutationCtx,
  device: Doc<"devices">,
  place: HistoryPlace,
  at: number,
  { unlessLast = false }: { unlessLast?: boolean } = {},
) => {
  if (unlessLast) {
    const previous = await ctx.db
      .query("deviceEvents")
      .withIndex("by_device_at", (q) => q.eq("deviceId", device.objectId))
      .order("desc")
      .filter((q) => q.eq(q.field("kind"), "located"))
      .first();
    if (previous?.place?.portId === place.portId) return;
  }
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

/**
 * Records where and how the network sees a device entering the inventory with
 * a MAC it already sighted: the device starts with the status that sighting
 * gives it, so the cycle, which records changes, would find none. Where it
 * was seen is recorded even when no read vouches for a status any more: the
 * cycle that reads it on that port again would find no move.
 */
export const recordArrival = async (
  ctx: MutationCtx,
  deviceId: string,
  at: number,
) => {
  const device = await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
    .unique();
  if (!device || !PRESENT_TYPES.has(device.type)) return;
  let latest: Doc<"macSightings"> | null = null;
  for (const mac of device.macs) {
    const row = await ctx.db
      .query("macSightings")
      .withIndex("by_site_mac", (q) =>
        q.eq("siteId", device.siteId).eq("mac", mac),
      )
      .unique();
    if (row && (!latest || row.seenAt > latest.seenAt)) latest = row;
  }
  if (!latest) return;
  // When the network saw it, which an expired read leaves hours back. A
  // device brought back by undo where it was has not moved.
  await recordLocated(
    ctx,
    device,
    await placeNamer(ctx)(latest),
    latest.seenAt,
    {
      unlessLast: true,
    },
  );
  const status = device.metadata.status;
  if (status === "up") {
    await recordPresence(ctx, device, "online", at);
  } else if (status === "down") {
    await recordPresence(ctx, device, "offline", at, latest.seenAt);
  }
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

/**
 * A site's history, newest first, of one kind of event or all, between
 * `from` and `to` (milliseconds, `to` excluded). `search` keeps the events
 * whose device name, place or one of the device's MACs holds every word: it
 * runs before pagination, so a page may come back short but none is missed.
 */
export const forSite = editorQuery({
  args: {
    siteId: v.string(),
    kind: v.optional(deviceEventKind),
    search: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: eventPage,
  handler: async (ctx, { siteId, kind, search, from, to, paginationOpts }) => {
    const events =
      kind === undefined
        ? ctx.db.query("deviceEvents").withIndex("by_site_at", (q) => {
            const site = q.eq("siteId", siteId);
            const after = from === undefined ? site : site.gte("at", from);
            return to === undefined ? after : after.lt("at", to);
          })
        : ctx.db.query("deviceEvents").withIndex("by_site_kind_at", (q) => {
            const site = q.eq("siteId", siteId).eq("kind", kind);
            const after = from === undefined ? site : site.gte("at", from);
            return to === undefined ? after : after.lt("at", to);
          });
    const ordered = events.order("desc");
    const query = search?.trim() ?? "";
    if (query === "") {
      const result = await ordered.paginate(paginationOpts);
      return { ...result, page: result.page.map(toPublicEvent) };
    }
    const macsOf = cached(async (deviceId) =>
      (
        await ctx.db
          .query("deviceMacs")
          .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
          .collect()
      ).map(({ mac }) => mac),
    );
    const result = await filter(ordered, async (event) =>
      matchesSearch(
        [
          event.deviceName,
          event.place?.socketName,
          event.place?.switchName,
          event.place?.portName,
          event.place?.floorName,
          event.place?.buildingName,
        ],
        await macsOf(event.deviceId),
        query,
      ),
    ).paginate(paginationOpts);
    return { ...result, page: result.page.map(toPublicEvent) };
  },
});

/**
 * Claims the snapshot slot whose window holds `at`, the time a cycle read the
 * network, unless an earlier cycle took it. The cycle then writes its entries
 * with `captureSlot`.
 */
export const claimSlot = async (
  ctx: MutationCtx,
  site: Doc<"sites">,
  at: number,
) => {
  const slot = snapshotSlotAt(site.timezone, at);
  if (!slot) return null;
  const taken = await ctx.db
    .query("historySlots")
    .withIndex("by_site_day", (q) =>
      q.eq("siteId", site.objectId).eq("day", slot.day).eq("time", slot.time),
    )
    .unique();
  if (taken) return null;
  return await ctx.db.insert("historySlots", {
    siteId: site.objectId,
    ...slot,
    takenAt: at,
  });
};

/**
 * Writes one page of a snapshot from the sightings its cycle read, with the
 * names as they are now; the last page marks the slot complete.
 */
export const captureSlot = internalMutation({
  args: {
    slotId: v.id("historySlots"),
    sightings: v.array(macSighting),
    /** The snapshot's entry count, given with its last page. */
    total: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { slotId, sightings, total }) => {
    const slot = await ctx.db.get(slotId);
    if (!slot) return null;
    const placeOf = placeNamer(ctx);
    for (const { mac, switchId, portId, socketId } of sightings) {
      const owned = await ctx.db
        .query("deviceMacs")
        .withIndex("by_site_mac", (q) =>
          q.eq("siteId", slot.siteId).eq("mac", mac),
        )
        .unique();
      const device = owned
        ? await ctx.db
            .query("devices")
            .withIndex("by_object_id", (q) => q.eq("objectId", owned.deviceId))
            .unique()
        : null;
      await ctx.db.insert("historySlotEntries", {
        slotId,
        siteId: slot.siteId,
        slotAt: slot.at,
        mac,
        ...(device && { deviceId: device.objectId, deviceName: device.name }),
        place: await placeOf({ switchId, portId, socketId }),
      });
    }
    if (total !== undefined) await ctx.db.patch(slotId, { entries: total });
    return null;
  },
});

/** The site's most recent complete snapshot, where the snapshots view opens. */
export const latestSlot = editorQuery({
  args: { siteId: v.string() },
  returns: v.union(v.null(), v.object({ day: v.string(), time: v.string() })),
  handler: async (ctx, { siteId }) => {
    // A failed capture leaves a slot without entries; skip a few of those.
    const recent = await ctx.db
      .query("historySlots")
      .withIndex("by_site_day", (q) => q.eq("siteId", siteId))
      .order("desc")
      .take(20);
    const slot = recent.find(({ entries }) => entries !== undefined);
    return slot ? { day: slot.day, time: slot.time } : null;
  },
});

/** The snapshots a site took on one of its days, in time order. */
export const slotsForDay = editorQuery({
  args: { siteId: v.string(), day: v.string() },
  returns: v.array(publicSnapshotSlot),
  handler: async (ctx, { siteId, day }) => {
    const slots = await ctx.db
      .query("historySlots")
      .withIndex("by_site_day", (q) => q.eq("siteId", siteId).eq("day", day))
      .collect();
    return slots.map(({ time, at, takenAt, entries }) => ({
      day,
      time,
      at,
      takenAt,
      ...(entries !== undefined && { entries }),
    }));
  },
});

const toPublicEntry = ({
  slotAt,
  mac,
  deviceId,
  deviceName,
  place,
}: Doc<"historySlotEntries">): Infer<typeof publicSnapshotEntry> => ({
  slotAt,
  mac,
  ...(deviceId !== undefined && { deviceId }),
  ...(deviceName !== undefined && { deviceName }),
  place,
});

/**
 * Where each MAC address was at one snapshot, in address order. `search`
 * keeps the entries whose MAC (any notation), device or place holds every
 * word, across the whole snapshot before pagination: a page may come back
 * short, never missing a match.
 */
export const slotEntries = editorQuery({
  args: {
    siteId: v.string(),
    day: v.string(),
    time: v.string(),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(publicSnapshotEntry),
  handler: async (ctx, { siteId, day, time, search, paginationOpts }) => {
    const slot = await ctx.db
      .query("historySlots")
      .withIndex("by_site_day", (q) =>
        q.eq("siteId", siteId).eq("day", day).eq("time", time),
      )
      .unique();
    if (slot?.entries === undefined) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const entries = ctx.db
      .query("historySlotEntries")
      .withIndex("by_slot_mac", (q) => q.eq("slotId", slot._id));
    const query = search?.trim() ?? "";
    const result = await (
      query === ""
        ? entries
        : filter(entries, (entry) =>
            matchesSearch(
              [
                entry.deviceName,
                entry.place.socketName,
                entry.place.switchName,
                entry.place.portName,
                entry.place.floorName,
                entry.place.buildingName,
              ],
              [entry.mac],
              query,
            ),
          )
    ).paginate(paginationOpts);
    return { ...result, page: result.page.map(toPublicEntry) };
  },
});

/**
 * Where a device was at each snapshot, newest first. An entry of a capture
 * that stopped before its end is left out, as `slotEntries` leaves out the
 * whole snapshot: it reads as no snapshot, so a page may come back short.
 */
export const snapshotsForDevice = editorQuery({
  args: { deviceId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(publicSnapshotEntry),
  handler: async (ctx, { deviceId, paginationOpts }) => {
    const result = await ctx.db
      .query("historySlotEntries")
      .withIndex("by_device_at", (q) => q.eq("deviceId", deviceId))
      .order("desc")
      .paginate(paginationOpts);
    const complete = new Map<Id<"historySlots">, boolean>();
    const page = [];
    for (const entry of result.page) {
      if (!complete.has(entry.slotId)) {
        const slot = await ctx.db.get(entry.slotId);
        complete.set(entry.slotId, slot?.entries !== undefined);
      }
      if (complete.get(entry.slotId)) page.push(toPublicEntry(entry));
    }
    return { ...result, page };
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
    let budget = PURGE_BATCH;
    const events = await ctx.db
      .query("deviceEvents")
      .withIndex("by_at", (q) => q.lt("at", before))
      .take(budget);
    for (const row of events) await ctx.db.delete(row._id);
    budget -= events.length;
    const slots = await ctx.db
      .query("historySlots")
      .withIndex("by_at", (q) => q.lt("at", before))
      .take(budget);
    for (const slot of slots) {
      if (budget === 0) break;
      const entries = await ctx.db
        .query("historySlotEntries")
        .withIndex("by_slot_mac", (q) => q.eq("slotId", slot._id))
        .take(budget);
      for (const row of entries) await ctx.db.delete(row._id);
      budget -= entries.length;
      // A slot goes once its entries have.
      if (budget > 0) {
        await ctx.db.delete(slot._id);
        budget -= 1;
      }
    }
    if (budget === 0) {
      await ctx.scheduler.runAfter(0, internal.history.purge, {});
    }
    return null;
  },
});
