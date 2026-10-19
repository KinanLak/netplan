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
import { deviceEventKind, historyPlace } from "./historyValidators";
import {
  connectionCheck,
  cycleRun,
  encryptedSecret,
  fdbTable,
  importedDevice,
  integrationKind,
  librenmsSettings,
  netboxSettings,
  pushedValues,
  pushRun,
  runningCycle,
  runningPush,
  siteCadence,
  switchRead,
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
    /** Sends the token to whatever certificate answers (ADR 0028). */
    ignoreCertificateErrors: v.optional(v.boolean()),
    lastCheck: v.optional(connectionCheck),
    /** NetBox only: what the site imports from it. */
    netbox: v.optional(netboxSettings),
    /** LibreNMS only: the device each polled switch stands for. */
    librenms: v.optional(librenmsSettings),
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
    /**
     * When the last cycle in which every source answered started: the data
     * is as fresh as that (ADR 0026).
     */
    lastSuccessAt: v.optional(v.number()),
    /** NetBox changes slowly: it is imported every 15 minutes (ADR 0023). */
    netboxImportedAt: v.optional(v.number()),
    /** LibreNMS is asked to rediscover at most every 5 minutes (ADR 0023). */
    librenmsDiscoveryAt: v.optional(v.number()),
    /** What the last read of each LibreNMS device's forwarding table left. */
    librenmsTables: v.optional(
      v.array(v.object({ deviceId: v.number(), table: fdbTable })),
    ),
    /** When each polled switch was last read; statuses rest on it (ADR 0025). */
    switchReads: v.optional(v.array(switchRead)),
    /** The push run to NetBox that follows a cycle (ADR 0027). */
    pushRunning: v.optional(runningPush),
    lastPush: v.optional(pushRun),
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

  // Where the network last saw each MAC address of a site (ADR 0022), apart
  // from the devices so that a cycle rewrites a device only when it comes
  // online or goes offline. A MAC no device carries is an unknown MAC.
  macSightings: defineTable({
    siteId: v.string(),
    mac: v.string(),
    switchId: v.string(),
    portId: v.string(),
    /** The wall socket the port's cabling reaches, if any. */
    socketId: v.optional(v.string()),
    seenAt: v.number(),
    /** Cycles in a row that read its switch without seeing it. */
    misses: v.number(),
    /**
     * The device whose status the MAC last set, so that one that drops the
     * MAC still has its status settled.
     */
    ownerId: v.optional(v.string()),
  }).index("by_site_mac", ["siteId", "mac"]),

  // What the network observed of each pc and endpoint, kept 30 days (ADR
  // 0027): where it was first seen and seen again elsewhere, and when it went
  // online or offline. Written only by the collection cycle.
  deviceEvents: defineTable({
    siteId: v.string(),
    deviceId: v.string(),
    /** The device's name when the event was recorded. */
    deviceName: v.string(),
    at: v.number(),
    kind: deviceEventKind,
    /** Where it was seen (`located`). */
    place: v.optional(historyPlace),
    /** When it was last seen (`offline`). */
    lastSeenAt: v.optional(v.number()),
  })
    .index("by_device_at", ["deviceId", "at"])
    .index("by_site_at", ["siteId", "at"])
    .index("by_site_kind_at", ["siteId", "kind", "at"])
    .index("by_at", ["at"]),

  // What the push last sent to each NetBox device, and its failures (ADR
  // 0027). A row whose `retryAt` is set is failing.
  netboxPushes: defineTable({
    siteId: v.string(),
    deviceId: v.string(),
    /** The NetBox device the values went to. */
    netboxId: v.number(),
    sent: v.optional(pushedValues),
    sentAt: v.optional(v.number()),
    /** Refusals in a row. */
    failures: v.number(),
    message: v.optional(v.string()),
    failingSince: v.optional(v.number()),
    retryAt: v.optional(v.number()),
  })
    .index("by_device", ["deviceId"])
    .index("by_site_retry", ["siteId", "retryAt"]),

  // The five daily MAC snapshots of a site (ADR 0027): a slot is claimed by
  // the cycle that reads the network in its window, which then writes where
  // it saw each MAC. A slot no cycle took has no row.
  historySlots: defineTable({
    siteId: v.string(),
    /** The site's calendar day, `YYYY-MM-DD`. */
    day: v.string(),
    /** One of `SNAPSHOT_TIMES`, in the site's time zone. */
    time: v.string(),
    at: v.number(),
    takenAt: v.number(),
    /** Set once every entry is written. */
    entries: v.optional(v.number()),
  })
    .index("by_site_day", ["siteId", "day", "time"])
    .index("by_at", ["at"]),

  historySlotEntries: defineTable({
    slotId: v.id("historySlots"),
    siteId: v.string(),
    slotAt: v.number(),
    mac: v.string(),
    /** The device that carried the MAC then, and its name then. */
    deviceId: v.optional(v.string()),
    deviceName: v.optional(v.string()),
    place: historyPlace,
  })
    .index("by_slot_mac", ["slotId", "mac"])
    .index("by_device_at", ["deviceId", "slotAt"]),

  /** Unknown MACs an Éditeur chose to ignore (ADR 0026). */
  ignoredMacs: defineTable({
    siteId: v.string(),
    mac: v.string(),
    ignoredBy: v.string(),
    /** The name at the time, so the list reads without the auth tables. */
    ignoredByName: v.string(),
    ignoredAt: v.number(),
  }).index("by_site_mac", ["siteId", "mac"]),

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
    // Whether a device of the site was seen on the port by its switch's last
    // read (ADR 0025).
    seen: v.optional(v.literal(true)),
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
    .index("by_b_port", ["bPortId"])
    .index("by_site_source", [
      "siteId",
      "source.integration",
      "source.externalId",
    ]),

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
