// MAC addresses LibreNMS sees on edge ports that no device of the site
// carries (ADR 0022). An Éditeur turns one into an endpoint, placed next to
// the socket it is seen at, or ignores it (ADR 0026).
import { ConvexError, v } from "convex/values";
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
      const socket =
        row.socketId === undefined ? null : await deviceOf(ctx, row.socketId);
      unknown.push({
        mac: row.mac,
        seenAt: row.seenAt,
        switchName: (await deviceOf(ctx, row.switchId))?.name ?? null,
        portName: await portName(ctx, row.portId),
        socket: socket
          ? {
              id: socket.objectId,
              name: socket.name,
              placed: socket.placement !== undefined,
            }
          : null,
      });
    }
    return unknown.toSorted((a, b) => b.seenAt - a.seenAt);
  },
});

/**
 * Creates an endpoint that carries an unknown MAC, next to the socket it is
 * seen at, or on no floor when it is seen on an uncabled port. Returns
 * whether it was placed.
 */
export const createDevice = editorMutation({
  args: {
    siteId: v.string(),
    mac: v.string(),
    deviceId: v.string(),
    name: v.string(),
  },
  returns: v.object({ placed: v.boolean() }),
  handler: async (ctx, { siteId, mac, deviceId, name }) => {
    const row = await ctx.db
      .query("macSightings")
      .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
      .unique();
    if (!row) {
      throw new ConvexError("Cette adresse MAC n'est plus vue sur le réseau.");
    }
    await insertManualDevice(
      ctx,
      {
        siteId,
        deviceId,
        type: "endpoint",
        identity: { name, macs: [mac] },
      },
      ctx.user.id,
    );
    await ctx.db.patch(row._id, { ownerId: deviceId });
    const device = await deviceOf(ctx, deviceId);
    const placed =
      device !== null &&
      row.socketId !== undefined &&
      (await placeNextTo(ctx, device, row.socketId, ctx.user.id));
    return { placed };
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

/**
 * Keeps a MAC out of the unknown ones for good, for a phone or a visitor's
 * laptop. Ignoring one already ignored changes nothing, so an undo replays.
 */
export const ignore = editorMutation({
  args: { siteId: v.string(), mac: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId, mac: text }) => {
    const mac = await siteMac(ctx, siteId, text);
    const owner = await ownerOf(ctx, siteId, mac);
    if (owner) {
      throw new ConvexError(
        `L'adresse MAC ${mac} est celle de ${owner.name} : elle n'est pas inconnue.`,
      );
    }
    if (await ignoredRowOf(ctx, siteId, mac)) return null;
    await ctx.db.insert("ignoredMacs", {
      siteId,
      mac,
      ignoredBy: ctx.user.id,
      ignoredByName: ctx.user.name,
      ignoredAt: Date.now(),
    });
    return null;
  },
});

/** The inverse of `ignore`; restoring one not ignored changes nothing. */
export const restore = editorMutation({
  args: { siteId: v.string(), mac: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId, mac: text }) => {
    const mac = await siteMac(ctx, siteId, text);
    const row = await ignoredRowOf(ctx, siteId, mac);
    if (row) await ctx.db.delete(row._id);
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
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const ignored = [];
    for (const row of await ignoredRowsOf(ctx, siteId)) {
      // A device that gained the MAC takes it out of both lists.
      if (await ownerOf(ctx, siteId, row.mac)) continue;
      ignored.push({
        mac: row.mac,
        ignoredAt: row.ignoredAt,
        ignoredByName: row.ignoredByName,
      });
    }
    return ignored.toSorted((a, b) => b.ignoredAt - a.ignoredAt);
  },
});
