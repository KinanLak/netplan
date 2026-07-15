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

const integrationProvider = v.union(v.literal("netbox"), v.literal("librenms"));

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

const externalDeviceSource = v.object({
  provider: v.literal("netbox"),
  externalId: v.string(),
  url: v.string(),
  site: v.string(),
  location: v.optional(v.string()),
  locationPath: v.array(v.string()),
  role: v.string(),
  lifecycleStatus: v.string(),
  syncedAt: v.number(),
});

const deviceMetadata = v.object({
  ip: v.optional(v.string()),
  status: v.optional(deviceStatus),
  model: v.optional(v.string()),
  ports: v.optional(v.array(portInfo)),
  lastUser: v.optional(v.string()),
  macs: v.optional(v.array(v.string())),
  source: v.optional(externalDeviceSource),
});

export default defineSchema({
  buildings: defineTable({
    objectId: v.string(),
    name: v.string(),
    order: v.number(),
  }).index("by_object_id", ["objectId"]),

  floors: defineTable({
    objectId: v.string(),
    buildingId: v.string(),
    name: v.string(),
    order: v.number(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_building", ["buildingId", "order"]),

  devices: defineTable({
    objectId: v.string(),
    floorId: v.string(),
    type: deviceType,
    name: v.string(),
    hostname: v.optional(v.string()),
    position,
    size,
    metadata: deviceMetadata,
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_floor", ["floorId"]),

  walls: defineTable({
    objectId: v.string(),
    floorId: v.string(),
    start: position,
    end: position,
    color: wallColor,
    geometryKey: v.string(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_floor", ["floorId"])
    .index("by_floor_geometry", ["floorId", "geometryKey"]),

  links: defineTable({
    objectId: v.string(),
    floorId: v.string(),
    fromDeviceId: v.string(),
    fromPort: v.optional(v.string()),
    toDeviceId: v.string(),
    toPort: v.optional(v.string()),
    label: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_floor", ["floorId"])
    .index("by_from_device", ["fromDeviceId"])
    .index("by_to_device", ["toDeviceId"]),

  documentRevisions: defineTable({
    floorId: v.string(),
    revision: v.number(),
    updatedAt: v.number(),
  }).index("by_floor", ["floorId"]),

  clientOperations: defineTable({
    opId: v.string(),
    clientId: v.string(),
    clientSeq: v.number(),
    floorId: v.optional(v.string()),
    kind: v.string(),
    status: v.union(v.literal("applied"), v.literal("rejected")),
    error: v.optional(v.string()),
    appliedRevision: v.optional(v.number()),
    createdAt: v.number(),
    appliedAt: v.number(),
  })
    .index("by_op_id", ["opId"])
    .index("by_client_seq", ["clientId", "clientSeq"]),

  externalInventory: defineTable({
    provider: v.literal("netbox"),
    externalId: v.string(),
    type: deviceType,
    name: v.string(),
    hostname: v.optional(v.string()),
    model: v.optional(v.string()),
    role: v.string(),
    site: v.string(),
    location: v.optional(v.string()),
    locationPath: v.array(v.string()),
    ip: v.optional(v.string()),
    macs: v.array(v.string()),
    interfaceCount: v.number(),
    lifecycleStatus: v.string(),
    url: v.string(),
    sourceUpdatedAt: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_provider_external", ["provider", "externalId"])
    .index("by_provider_site", ["provider", "site"])
    .index("by_provider_site_type", ["provider", "site", "type"]),

  externalConnections: defineTable({
    provider: v.literal("netbox"),
    site: v.string(),
    externalId: v.string(),
    fromExternalId: v.string(),
    fromPort: v.optional(v.string()),
    toExternalId: v.string(),
    toPort: v.optional(v.string()),
    kind: v.literal("physical"),
    syncedAt: v.number(),
  })
    .index("by_provider_external", ["provider", "externalId"])
    .index("by_from", ["provider", "fromExternalId"])
    .index("by_to", ["provider", "toExternalId"]),

  discoveredConnections: defineTable({
    provider: v.literal("librenms"),
    site: v.string(),
    externalId: v.string(),
    computerExternalId: v.string(),
    socketExternalId: v.string(),
    switchExternalId: v.string(),
    switchPort: v.string(),
    computerMac: v.optional(v.string()),
    method: v.union(v.literal("fdb"), v.literal("lldp"), v.literal("fdb+lldp")),
    confidence: v.union(v.literal("high"), v.literal("medium")),
    observedAt: v.number(),
    syncedAt: v.number(),
  })
    .index("by_provider_site", ["provider", "site"])
    .index("by_computer", ["provider", "computerExternalId"])
    .index("by_socket", ["provider", "socketExternalId"]),

  integrationSyncs: defineTable({
    provider: integrationProvider,
    site: v.string(),
    status: v.union(
      v.literal("syncing"),
      v.literal("ready"),
      v.literal("error"),
    ),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    inventoryCount: v.number(),
    connectionCount: v.number(),
    sourceVersion: v.optional(v.string()),
  }).index("by_provider_site", ["provider", "site"]),

  presences: defineTable({
    sessionId: v.string(),
    clientId: v.string(),
    displayName: v.string(),
    colorHue: v.number(),
    floorId: v.string(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"])
    .index("by_floor", ["floorId"]),
});
