import { ConvexError, v } from "convex/values";
import { readerQuery, readerMutation } from "./lib/functions";
import { colorHueFor } from "./lib/presence";

const onlineUserShape = v.object({
  clientId: v.string(),
  userId: v.string(),
  displayName: v.string(),
  colorHue: v.number(),
  floorId: v.string(),
  activeAt: v.number(),
  updatedAt: v.number(),
});

// A page that closes without `pagehide` leaves its row behind; the next
// heartbeat of the same user removes it once it is clearly gone.
const ABANDONED_AFTER_MS = 60_000;

export const updateOnlineUser = readerMutation({
  args: {
    clientId: v.string(),
    floorId: v.string(),
    // The page was focused or shown since its last heartbeat.
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { clientId, floorId, active }) => {
    const floor = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
      .unique();
    if (!floor) throw new ConvexError("Cet étage n'existe plus.");

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

    // Every page heartbeats, so the time of the last heartbeat says nothing
    // about which page the user is looking at; arriving on a floor or coming
    // back to the page does.
    const activeAt =
      !current || current.floorId !== floorId || active
        ? now
        : current.activeAt;
    const next = {
      displayName: ctx.user.name,
      floorId,
      activeAt,
      updatedAt: now,
    };
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
    // One entry per page: which of a user's pages to show depends on which
    // are still alive, and only the client's clock ticks between updates.
    const presences = await ctx.db.query("presences").collect();

    return presences.map((presence) => ({
      clientId: presence.clientId,
      userId: presence.userId,
      displayName: presence.displayName,
      colorHue: colorHueFor(presence.userId),
      floorId: presence.floorId,
      activeAt: presence.activeAt,
      updatedAt: presence.updatedAt,
    }));
  },
});
