import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  deviceIdentityFields,
  deviceMetadata,
  devicePlacement,
  deviceSource,
  position,
  wallColor,
} from "./mapValidators";
import {
  connectionCheck,
  encryptedSecret,
  integrationKind,
  siteCadence,
} from "./siteValidators";

export default defineSchema({
  sites: defineTable({
    objectId: v.string(),
    name: v.string(),
    timezone: v.string(),
    cadence: siteCadence,
    automaticRefresh: v.boolean(),
    manualRefresh: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_object_id", ["objectId"]),

  // At most one per site and tool, so the pair is its identity.
  integrations: defineTable({
    siteId: v.string(),
    kind: integrationKind,
    baseUrl: v.string(),
    enabled: v.boolean(),
    token: encryptedSecret,
    lastCheck: v.optional(connectionCheck),
    updatedAt: v.number(),
  }).index("by_site_kind", ["siteId", "kind"]),

  buildings: defineTable({
    objectId: v.string(),
    siteId: v.string(),
    name: v.string(),
    order: v.number(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_site", ["siteId", "order"]),

  floors: defineTable({
    objectId: v.string(),
    buildingId: v.string(),
    name: v.string(),
    order: v.number(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_building", ["buildingId", "order"]),

  // The site inventory (ADR 0022): a device without a placement is known but
  // not on any floor.
  devices: defineTable({
    objectId: v.string(),
    siteId: v.string(),
    ...deviceIdentityFields,
    placement: v.optional(devicePlacement),
    source: v.optional(deviceSource),
    metadata: deviceMetadata,
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_site", ["siteId"])
    .index("by_floor", ["placement.floorId"]),

  // One row per MAC address of a device, so a MAC belongs to at most one
  // device of a site and a sighting finds its device in one lookup.
  deviceMacs: defineTable({
    siteId: v.string(),
    mac: v.string(),
    deviceId: v.string(),
  })
    .index("by_site_mac", ["siteId", "mac"])
    .index("by_device", ["deviceId"]),

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

  // One calque per floor (ADR 0024); `fileId` is a `floorOverlayFiles` object id.
  floorOverlays: defineTable({
    floorId: v.string(),
    fileId: v.string(),
    imageWidth: v.number(),
    imageHeight: v.number(),
    center: position,
    scale: v.number(),
    rotation: v.number(),
    opacity: v.number(),
    locked: v.boolean(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_floor", ["floorId"])
    .index("by_file", ["fileId"]),

  // Checked calque images. `releasedAt` is set while no calque uses the file;
  // a daily job deletes it a week later, so undo can still bring it back.
  floorOverlayFiles: defineTable({
    objectId: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.union(v.literal("image/png"), v.literal("image/jpeg")),
    width: v.number(),
    height: v.number(),
    size: v.number(),
    createdAt: v.number(),
    createdBy: v.string(),
    releasedAt: v.optional(v.number()),
  })
    .index("by_object_id", ["objectId"])
    .index("by_released", ["releasedAt"]),

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

  // One row per open page, keyed by the page's random id (ADR 0021); the
  // name is the signed-in user's, copied at each heartbeat.
  presences: defineTable({
    clientId: v.string(),
    userId: v.string(),
    displayName: v.string(),
    floorId: v.string(),
    activeAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_user", ["userId"])
    .index("by_floor", ["floorId"]),

  // A single row: the Keycloak role names that grant Éditeur and Admin
  // (ADR 0004). Absent until an admin first saves them.
  authSettings: defineTable({
    keycloakEditorRole: v.union(v.string(), v.null()),
    keycloakAdminRole: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  }),
});
