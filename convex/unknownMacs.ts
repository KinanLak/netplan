// MAC addresses LibreNMS sees on edge ports that no device of the site
// carries (ADR 0022). An Éditeur turns one into an endpoint, placed next to
// the socket it is seen at.
import { ConvexError, v } from "convex/values";
import { insertManualDevice } from "./devices";
import { editorMutation, editorQuery } from "./lib/functions";
import { deviceOf, ownerOf, placeNextTo } from "./librenmsCycle";
import { isOnline } from "../src/sites/librenmsCycle";

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
    const unknown = [];
    for (const row of rows) {
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
        // The cycle that saw it would have set it.
        metadata: { status: isOnline([row.misses]) ? "up" : "down" },
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
