import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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

const wallColor = v.union(
  v.literal("sand"),
  v.literal("concrete"),
  v.literal("slate"),
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

export default defineSchema({
  buildings: defineTable({
    name: v.string(),
    order: v.number(),
  }),

  floors: defineTable({
    buildingId: v.id("buildings"),
    name: v.string(),
    order: v.number(),
  }).index("by_building", ["buildingId", "order"]),

  devices: defineTable({
    floorId: v.id("floors"),
    type: deviceType,
    name: v.string(),
    hostname: v.optional(v.string()),
    position,
    size,
    metadata: deviceMetadata,
  }).index("by_floor", ["floorId"]),

  walls: defineTable({
    floorId: v.id("floors"),
    start: position,
    end: position,
    color: wallColor,
  }).index("by_floor", ["floorId"]),

  links: defineTable({
    floorId: v.id("floors"),
    fromDeviceId: v.id("devices"),
    fromPort: v.optional(v.string()),
    toDeviceId: v.id("devices"),
    toPort: v.optional(v.string()),
    label: v.optional(v.string()),
  })
    .index("by_floor", ["floorId"])
    .index("by_from_device", ["fromDeviceId"])
    .index("by_to_device", ["toDeviceId"]),

  presences: defineTable({
    sessionId: v.string(),
    displayName: v.string(),
    colorHue: v.number(),
    floorId: v.optional(v.id("floors")),
    cursor: v.optional(position),
    selectedDeviceId: v.optional(v.id("devices")),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_floor", ["floorId"]),
});
