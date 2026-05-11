import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const deviceType = v.union(
  v.literal("rack"),
  v.literal("switch"),
  v.literal("pc"),
  v.literal("wall-port"),
);

const deviceStatus = v.union(
  v.literal("up"),
  v.literal("down"),
  v.literal("unknown"),
);

const position = v.object({ x: v.number(), y: v.number() });
const size = v.object({ width: v.number(), height: v.number() });

const portInfo = v.object({
  id: v.string(),
  number: v.number(),
  status: deviceStatus,
});

const deviceMetadata = v.object({
  ip: v.optional(v.string()),
  status: v.optional(deviceStatus),
  model: v.optional(v.string()),
  ports: v.optional(v.array(portInfo)),
  lastUser: v.optional(v.string()),
});

const linkSnapshot = v.object({
  floorId: v.id("floors"),
  fromDeviceId: v.id("devices"),
  fromPort: v.optional(v.string()),
  toDeviceId: v.id("devices"),
  toPort: v.optional(v.string()),
  label: v.optional(v.string()),
});

const deviceDraft = v.object({
  floorId: v.id("floors"),
  type: deviceType,
  name: v.string(),
  hostname: v.optional(v.string()),
  position,
  size,
  metadata: deviceMetadata,
});

const deviceRemovalSnapshot = v.object({
  deviceId: v.id("devices"),
  draft: deviceDraft,
  links: v.array(linkSnapshot),
});

const assertFloorExists = async (ctx: MutationCtx, floorId: Id<"floors">) => {
  const floor = await ctx.db.get(floorId);
  if (!floor) throw new ConvexError("Floor not found");
};

const toLinkSnapshot = (link: Doc<"links">) => {
  const snapshot: {
    floorId: Id<"floors">;
    fromDeviceId: Id<"devices">;
    fromPort?: string;
    toDeviceId: Id<"devices">;
    toPort?: string;
    label?: string;
  } = {
    floorId: link.floorId,
    fromDeviceId: link.fromDeviceId,
    toDeviceId: link.toDeviceId,
  };
  if (link.fromPort !== undefined) snapshot.fromPort = link.fromPort;
  if (link.toPort !== undefined) snapshot.toPort = link.toPort;
  if (link.label !== undefined) snapshot.label = link.label;
  return snapshot;
};

const clearPresenceSelection = async (
  ctx: MutationCtx,
  deviceId: Id<"devices">,
) => {
  const presences = await ctx.db.query("presences").collect();
  for (const presence of presences) {
    if (presence.selectedDeviceId === deviceId) {
      await ctx.db.patch(presence._id, { selectedDeviceId: undefined });
    }
  }
};

export const listForFloor = query({
  args: { floorId: v.id("floors") },
  handler: async (ctx, { floorId }): Promise<Array<Doc<"devices">>> => {
    return await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect();
  },
});

export const create = mutation({
  args: {
    floorId: v.id("floors"),
    type: deviceType,
    name: v.string(),
    hostname: v.optional(v.string()),
    position,
    size,
    metadata: deviceMetadata,
  },
  returns: v.id("devices"),
  handler: async (ctx, args): Promise<Id<"devices">> => {
    await assertFloorExists(ctx, args.floorId);
    return await ctx.db.insert("devices", args);
  },
});

export const updatePosition = mutation({
  args: {
    id: v.id("devices"),
    position,
  },
  returns: v.null(),
  handler: async (ctx, { id, position: nextPosition }) => {
    const device = await ctx.db.get(id);
    if (!device) throw new ConvexError("Device not found");
    await ctx.db.patch(id, { position: nextPosition });
    return null;
  },
});

export const rename = mutation({
  args: {
    id: v.id("devices"),
    name: v.string(),
    hostname: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, name, hostname }) => {
    const device = await ctx.db.get(id);
    if (!device) throw new ConvexError("Device not found");
    await ctx.db.patch(id, { name, hostname });
    return null;
  },
});

export const updateMetadata = mutation({
  args: {
    id: v.id("devices"),
    metadata: deviceMetadata,
  },
  returns: v.null(),
  handler: async (ctx, { id, metadata }) => {
    const device = await ctx.db.get(id);
    if (!device) throw new ConvexError("Device not found");
    await ctx.db.patch(id, { metadata });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("devices") },
  returns: deviceRemovalSnapshot,
  handler: async (ctx, { id }) => {
    const device = await ctx.db.get(id);
    if (!device) throw new ConvexError("Device not found");

    const incoming = await ctx.db
      .query("links")
      .withIndex("by_to_device", (q) => q.eq("toDeviceId", id))
      .collect();
    const outgoing = await ctx.db
      .query("links")
      .withIndex("by_from_device", (q) => q.eq("fromDeviceId", id))
      .collect();

    const linkById = new Map<string, Doc<"links">>();
    for (const link of [...incoming, ...outgoing]) {
      linkById.set(link._id, link);
    }

    const links = Array.from(linkById.values()).map(toLinkSnapshot);
    for (const link of linkById.values()) await ctx.db.delete(link._id);
    await clearPresenceSelection(ctx, id);
    await ctx.db.delete(id);

    return {
      deviceId: id,
      draft: {
        floorId: device.floorId,
        type: device.type,
        name: device.name,
        hostname: device.hostname,
        position: device.position,
        size: device.size,
        metadata: device.metadata,
      },
      links,
    };
  },
});
