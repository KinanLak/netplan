import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

const onlineUserShape = v.object({
  sessionId: v.string(),
  clientId: v.string(),
  displayName: v.string(),
  colorHue: v.number(),
  floorId: v.string(),
  updatedAt: v.number(),
});

const latestPresencesByClient = (
  presences: Array<Doc<"presences">>,
): Array<Doc<"presences">> => {
  const latestByClient = new Map<string, Doc<"presences">>();

  for (const presence of presences) {
    const current = latestByClient.get(presence.clientId);
    if (!current || presence.updatedAt > current.updatedAt) {
      latestByClient.set(presence.clientId, presence);
    }
  }

  return Array.from(latestByClient.values());
};

export const updateOnlineUser = mutation({
  args: {
    sessionId: v.string(),
    clientId: v.string(),
    displayName: v.string(),
    colorHue: v.number(),
    floorId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const floor = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", args.floorId))
      .unique();
    if (!floor) throw new ConvexError("Floor not found");

    const existingByClient = await ctx.db
      .query("presences")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();

    const next = {
      clientId: args.clientId,
      displayName: args.displayName,
      colorHue: args.colorHue,
      floorId: args.floorId,
      updatedAt: Date.now(),
    };

    if (existingByClient.length > 0) {
      const existing =
        existingByClient.find(
          (presence) => presence.sessionId === args.sessionId,
        ) ?? existingByClient[0];
      await ctx.db.patch(existing._id, { sessionId: args.sessionId, ...next });
      for (const duplicate of existingByClient) {
        if (duplicate._id !== existing._id) await ctx.db.delete(duplicate._id);
      }
    } else {
      await ctx.db.insert("presences", { sessionId: args.sessionId, ...next });
    }

    return null;
  },
});

export const remove = mutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionId }) => {
    const existing = await ctx.db
      .query("presences")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    for (const presence of existing) {
      await ctx.db.delete(presence._id);
    }

    return null;
  },
});

export const listForFloor = query({
  args: { floorId: v.string() },
  returns: v.array(onlineUserShape),
  handler: async (ctx, { floorId }) => {
    const presences = await ctx.db
      .query("presences")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();

    return latestPresencesByClient(presences).map((presence) => ({
      sessionId: presence.sessionId,
      clientId: presence.clientId,
      displayName: presence.displayName,
      colorHue: presence.colorHue,
      floorId: presence.floorId,
      updatedAt: presence.updatedAt,
    }));
  },
});
