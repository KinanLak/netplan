import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { readerQuery, readerMutation } from "./lib/functions";
import { colorHueFor } from "./lib/presence";

const onlineUserShape = v.object({
  clientId: v.string(),
  userId: v.string(),
  displayName: v.string(),
  colorHue: v.number(),
  floorId: v.string(),
  updatedAt: v.number(),
});

// A page that closes without `pagehide` leaves its row behind; the next
// heartbeat of the same user removes it once it is clearly gone.
const ABANDONED_AFTER_MS = 60_000;

/** One row per user: the page they used last, wherever their other tabs are. */
const latestPresencesByUser = (
  presences: Array<Doc<"presences">>,
): Array<Doc<"presences">> => {
  const latestByUser = new Map<string, Doc<"presences">>();

  for (const presence of presences) {
    const current = latestByUser.get(presence.userId);
    if (!current || presence.updatedAt > current.updatedAt) {
      latestByUser.set(presence.userId, presence);
    }
  }

  return Array.from(latestByUser.values());
};

export const updateOnlineUser = readerMutation({
  args: {
    clientId: v.string(),
    floorId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { clientId, floorId }) => {
    const floor = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
      .unique();
    if (!floor) throw new ConvexError("Floor not found");

    const now = Date.now();
    const mine = await ctx.db
      .query("presences")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user.id))
      .collect();
    const current = mine.find((presence) => presence.clientId === clientId);
    for (const presence of mine) {
      if (
        presence !== current &&
        presence.updatedAt < now - ABANDONED_AFTER_MS
      ) {
        await ctx.db.delete(presence._id);
      }
    }

    const next = { displayName: ctx.user.name, floorId, updatedAt: now };
    if (current) {
      await ctx.db.patch(current._id, next);
    } else {
      await ctx.db.insert("presences", {
        clientId,
        userId: ctx.user.id,
        ...next,
      });
    }

    return null;
  },
});

export const remove = readerMutation({
  args: { clientId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clientId }) => {
    const existing = await ctx.db
      .query("presences")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .collect();

    for (const presence of existing) {
      if (presence.userId === ctx.user.id) await ctx.db.delete(presence._id);
    }

    return null;
  },
});

export const list = readerQuery({
  args: {},
  returns: v.array(onlineUserShape),
  handler: async (ctx) => {
    const presences = await ctx.db.query("presences").collect();

    return latestPresencesByUser(presences).map((presence) => ({
      clientId: presence.clientId,
      userId: presence.userId,
      displayName: presence.displayName,
      colorHue: colorHueFor(presence.userId),
      floorId: presence.floorId,
      updatedAt: presence.updatedAt,
    }));
  },
});
