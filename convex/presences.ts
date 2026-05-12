import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

const STALE_AFTER_MS = 30_000;

const position = v.object({ x: v.number(), y: v.number() });
const editingPresence = v.union(
  v.object({
    kind: v.literal("device.drag"),
    deviceId: v.string(),
    previewPosition: position,
    expiresAt: v.number(),
  }),
  v.object({ kind: v.literal("wall.draw"), expiresAt: v.number() }),
);

const drawTool = v.union(
  v.literal("device"),
  v.literal("wall"),
  v.literal("wall-brush"),
  v.literal("wall-erase"),
  v.literal("room"),
);

const presenceShape = v.object({
  sessionId: v.string(),
  clientId: v.string(),
  displayName: v.string(),
  colorHue: v.number(),
  floorId: v.optional(v.string()),
  cursor: v.optional(position),
  selectedDeviceId: v.optional(v.string()),
  selectedObjectIds: v.optional(v.array(v.string())),
  activeTool: v.optional(drawTool),
  editing: v.optional(editingPresence),
  updatedAt: v.number(),
});

export const updateCursor = mutation({
  args: {
    sessionId: v.string(),
    clientId: v.string(),
    displayName: v.string(),
    colorHue: v.number(),
    floorId: v.optional(v.string()),
    cursor: v.optional(position),
    selectedDeviceId: v.optional(v.string()),
    selectedObjectIds: v.optional(v.array(v.string())),
    activeTool: v.optional(drawTool),
    editing: v.optional(editingPresence),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const floorId = args.floorId;
    if (floorId) {
      const floor = await ctx.db
        .query("floors")
        .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
        .unique();
      if (!floor) throw new ConvexError("Floor not found");
    }

    const selectedDeviceId = args.selectedDeviceId;
    if (selectedDeviceId) {
      const device = await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", selectedDeviceId))
        .unique();
      if (!device) throw new ConvexError("Selected device not found");
      if (floorId && device.floorId !== floorId) {
        throw new ConvexError("Selected device must be on the presence floor");
      }
    }

    const existing = await ctx.db
      .query("presences")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();

    const updatedAt = Date.now();
    const next = {
      clientId: args.clientId,
      displayName: args.displayName,
      colorHue: args.colorHue,
      floorId: args.floorId,
      cursor: args.cursor,
      selectedDeviceId: args.selectedDeviceId,
      selectedObjectIds: args.selectedObjectIds,
      activeTool: args.activeTool,
      editing: args.editing,
      updatedAt,
    };
    if (existing) {
      await ctx.db.patch(existing._id, next);
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
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const listForFloor = query({
  args: { floorId: v.string() },
  returns: v.array(presenceShape),
  handler: async (ctx, { floorId }) => {
    const presences = await ctx.db
      .query("presences")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
    const cutoff = Date.now() - STALE_AFTER_MS;
    return presences
      .filter((presence) => presence.updatedAt >= cutoff)
      .map((presence) => ({
        sessionId: presence.sessionId,
        clientId: presence.clientId,
        displayName: presence.displayName,
        colorHue: presence.colorHue,
        floorId: presence.floorId,
        cursor: presence.cursor,
        selectedDeviceId: presence.selectedDeviceId,
        selectedObjectIds: presence.selectedObjectIds,
        activeTool: presence.activeTool,
        editing: presence.editing,
        updatedAt: presence.updatedAt,
      }));
  },
});
