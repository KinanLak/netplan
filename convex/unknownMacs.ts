// MAC addresses LibreNMS sees on edge ports that no device of the site
// carries (ADR 0022). An Éditeur turns one into an endpoint, placed next to
// the socket it is seen at, or ignores it (ADR 0026).
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { insertManualDevice } from "./devices";
import { editorMutation, editorQuery } from "./lib/functions";
import { ignoredMacsOf, ignoredRowsOf } from "./lib/ignoredMacs";
import { deviceOf, ownerOf, placeNextTo } from "./librenmsCycle";
import { normalizeMac } from "../src/devices/mac";

const portName = async (ctx: Parameters<typeof deviceOf>[0], portId: string) =>
  (
    await ctx.db
      .query("ports")
      .withIndex("by_object_id", (q) => q.eq("objectId", portId))
      .unique()
  )?.name ?? null;

/** Where a sighting is: its switch, port and socket, by name. */
const placeOf = async (ctx: QueryCtx, row: Doc<"macSightings">) => {
  const socket =
    row.socketId === undefined ? null : await deviceOf(ctx, row.socketId);
  return {
    switchName: (await deviceOf(ctx, row.switchId))?.name ?? null,
    portName: await portName(ctx, row.portId),
    socket: socket
      ? {
          id: socket.objectId,
          name: socket.name,
          placed: socket.placement !== undefined,
        }
      : null,
  };
};

const lastSeenOf = async (ctx: QueryCtx, row: Doc<"macSightings">) => {
  const place = await placeOf(ctx, row);
  return {
    at: row.seenAt,
    switchName: place.switchName,
    portName: place.portName,
    socketName: place.socket?.name ?? null,
  };
};

const sightingOf = async (ctx: QueryCtx, siteId: string, mac: string) =>
  await ctx.db
    .query("macSightings")
    .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
    .unique();

/** The site's unknown MACs, most recently seen first. */
export const listForSite = editorQuery({
  args: { siteId: v.string() },
  returns: v.array(
    v.object({
      mac: v.string(),
      seenAt: v.number(),
      switchName: v.union(v.string(), v.null()),
      portName: v.union(v.string(), v.null()),
      socket: v.union(
        v.null(),
        v.object({ id: v.string(), name: v.string(), placed: v.boolean() }),
      ),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const rows = await ctx.db
      .query("macSightings")
      .withIndex("by_site_mac", (q) => q.eq("siteId", siteId))
      .collect();
    const ignored = await ignoredMacsOf(ctx, siteId);
    const unknown = [];
    for (const row of rows) {
      if (ignored.has(row.mac)) continue;
      // A device may have gained the MAC since the last cycle.
      if (await ownerOf(ctx, siteId, row.mac)) continue;
      unknown.push({
        mac: row.mac,
        seenAt: row.seenAt,
        ...(await placeOf(ctx, row)),
      });
    }
    return unknown.toSorted((a, b) => b.seenAt - a.seenAt);
  },
});

/**
 * Creates a workstation or an endpoint that carries an unknown MAC, next to
 * the socket it is seen at, or on no floor when it is seen on an uncabled
 * port. Returns where it was placed, if it was.
 */
export const createDevice = editorMutation({
  args: {
    siteId: v.string(),
    mac: v.string(),
    deviceId: v.string(),
    // What a MAC seen on an edge port can be: an end device, not a switch.
    type: v.union(v.literal("pc"), v.literal("endpoint")),
    name: v.string(),
    hostname: v.optional(v.string()),
  },
  returns: v.object({
    location: v.union(
      v.null(),
      v.object({ buildingId: v.string(), floorId: v.string() }),
    ),
  }),
  handler: async (ctx, { siteId, mac, deviceId, type, name, hostname }) => {
    const row = await sightingOf(ctx, siteId, mac);
    if (!row) {
      throw new ConvexError("Cette adresse MAC n'est plus vue sur le réseau.");
    }
    await insertManualDevice(
      ctx,
      {
        siteId,
        deviceId,
        type,
        identity: { name, hostname, macs: [mac] },
      },
      ctx.user.id,
    );
    await ctx.db.patch(row._id, { ownerId: deviceId });
    const device = await deviceOf(ctx, deviceId);
    const placed =
      device !== null &&
      row.socketId !== undefined &&
      (await placeNextTo(ctx, device, row.socketId, ctx.user.id));
    if (!placed) return { location: null };
    const floorId = (await deviceOf(ctx, deviceId))?.placement?.floorId;
    const floor =
      floorId === undefined
        ? null
        : await ctx.db
            .query("floors")
            .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
            .unique();
    return {
      location: floor
        ? { buildingId: floor.buildingId, floorId: floor.objectId }
        : null,
    };
  },
});

const ignoredRowOf = async (ctx: QueryCtx, siteId: string, mac: string) =>
  await ctx.db
    .query("ignoredMacs")
    .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
    .unique();

const siteMac = async (ctx: QueryCtx, siteId: string, text: string) => {
  const site = await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
    .unique();
  if (!site) throw new ConvexError("Ce site n'existe plus.");
  const mac = normalizeMac(text);
  if (!mac) throw new ConvexError("Cette adresse MAC est illisible.");
  return mac;
};

/** One request ignores or restores at most a long page of MACs. */
const MAX_MACS = 500;

const siteMacs = async (
  ctx: QueryCtx,
  siteId: string,
  texts: Array<string>,
) => {
  if (texts.length > MAX_MACS) {
    throw new ConvexError(`Au plus ${MAX_MACS} adresses MAC à la fois.`);
  }
  const macs = [];
  for (const text of texts) macs.push(await siteMac(ctx, siteId, text));
  return [...new Set(macs)];
};

/**
 * Keeps MACs out of the unknown ones for good, for phones or visitors'
 * laptops, remembering where each was last seen. All or none: one carried
 * by a device refuses the lot. Ignoring one already ignored changes nothing,
 * so an undo replays.
 */
export const ignore = editorMutation({
  args: { siteId: v.string(), macs: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { siteId, macs: texts }) => {
    const macs = await siteMacs(ctx, siteId, texts);
    for (const mac of macs) {
      const owner = await ownerOf(ctx, siteId, mac);
      if (owner) {
        throw new ConvexError(
          `L'adresse MAC ${mac} est celle de ${owner.name} : elle n'est pas inconnue.`,
        );
      }
    }
    const ignoredAt = Date.now();
    for (const mac of macs) {
      if (await ignoredRowOf(ctx, siteId, mac)) continue;
      const sighting = await sightingOf(ctx, siteId, mac);
      await ctx.db.insert("ignoredMacs", {
        siteId,
        mac,
        ignoredBy: ctx.user.id,
        ignoredByName: ctx.user.name,
        ignoredAt,
        ...(sighting && { lastSeen: await lastSeenOf(ctx, sighting) }),
      });
    }
    return null;
  },
});

/** The inverse of `ignore`; restoring one not ignored changes nothing. */
export const restore = editorMutation({
  args: { siteId: v.string(), macs: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { siteId, macs: texts }) => {
    for (const mac of await siteMacs(ctx, siteId, texts)) {
      const row = await ignoredRowOf(ctx, siteId, mac);
      if (row) await ctx.db.delete(row._id);
    }
    return null;
  },
});

/** The site's ignored MACs that no device carries, most recent first. */
export const listIgnored = editorQuery({
  args: { siteId: v.string() },
  returns: v.array(
    v.object({
      mac: v.string(),
      ignoredAt: v.number(),
      ignoredByName: v.string(),
      lastSeen: v.optional(
        v.object({
          at: v.number(),
          switchName: v.union(v.string(), v.null()),
          portName: v.union(v.string(), v.null()),
          socketName: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const ignored = [];
    for (const row of await ignoredRowsOf(ctx, siteId)) {
      // A device that gained the MAC takes it out of both lists.
      if (await ownerOf(ctx, siteId, row.mac)) continue;
      // Still seen: where it is now; gone: where it was when ignored.
      const sighting = await sightingOf(ctx, siteId, row.mac);
      const lastSeen = sighting
        ? await lastSeenOf(ctx, sighting)
        : row.lastSeen;
      ignored.push({
        mac: row.mac,
        ignoredAt: row.ignoredAt,
        ignoredByName: row.ignoredByName,
        ...(lastSeen && { lastSeen }),
      });
    }
    return ignored.toSorted((a, b) => b.ignoredAt - a.ignoredAt);
  },
});
