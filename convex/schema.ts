import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  deviceIdentityFields,
  deviceMetadata,
  devicePlacement,
  deviceSource,
  deviceStatus,
  portKind,
  position,
  sourceRef,
  wallColor,
} from "./mapValidators";
import {
  connectionCheck,
  cycleRun,
  encryptedSecret,
  importedDevice,
  integrationKind,
  netboxSettings,
  runningCycle,
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
    /** NetBox only: what the site imports from it. */
    netbox: v.optional(netboxSettings),
    updatedAt: v.number(),
  }).index("by_site_kind", ["siteId", "kind"]),

  // A site's collection cycles (ADR 0023), apart from the site so that a
  // cycle every five minutes does not wake every reader of its settings.
  siteCycles: defineTable({
    siteId: v.string(),
    nextRunAt: v.number(),
    /** Failed cycles in a row, which space out the next ones. */
    failures: v.number(),
    running: v.optional(runningCycle),
    last: v.optional(cycleRun),
    /** NetBox changes slowly: it is imported every 15 minutes (ADR 0023). */
    netboxImportedAt: v.optional(v.number()),
  }).index("by_site", ["siteId"]),

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
    .index("by_floor", ["placement.floorId"])
    .index("by_site_source", [
      "siteId",
      "source.integration",
      "source.externalId",
    ]),

  // Imported devices that wait for a person (ADR 0022): a suggestion when
  // only a hostname matches, a conflict when the match is ambiguous.
  importReviews: defineTable({
    siteId: v.string(),
    integration: integrationKind,
    kind: v.union(v.literal("suggestion"), v.literal("conflict")),
    device: importedDevice,
    candidateIds: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_site", ["siteId", "integration", "device.externalId"]),

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

  // A device's ports (ADR 0022). Netplan names the ports of a manual device;
  // a source's come with their external id.
  ports: defineTable({
    objectId: v.string(),
    siteId: v.string(),
    deviceId: v.string(),
    name: v.string(),
    kind: portKind,
    order: v.number(),
    rearPortId: v.optional(v.string()),
    status: v.optional(deviceStatus),
    source: v.optional(sourceRef),
  })
    .index("by_object_id", ["objectId"])
    .index("by_device", ["deviceId"])
    // A trace crosses a patch panel from a rear port back to its front one.
    .index("by_rear_port", ["rearPortId"]),

  // One cable per port. Each end repeats its device, so a floor finds the
  // cables of its devices without reading their ports first.
  cables: defineTable({
    objectId: v.string(),
    siteId: v.string(),
    aDeviceId: v.string(),
    aPortId: v.string(),
    bDeviceId: v.string(),
    bPortId: v.string(),
    source: v.optional(sourceRef),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_a_device", ["aDeviceId"])
    .index("by_b_device", ["bDeviceId"])
    .index("by_a_port", ["aPortId"])
    .index("by_b_port", ["bPortId"]),

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
