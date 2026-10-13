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

const integrationWorkflow = v.union(
  v.literal("netbox"),
  v.literal("localization"),
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

const externalDeviceSource = v.object({
  provider: v.literal("netbox"),
  siteId: v.string(),
  instanceKey: v.string(),
  externalId: v.string(),
  url: v.string(),
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
  localization: v.optional(
    v.object({
      state: v.union(
        v.literal("online"),
        v.literal("resolved_unplaced"),
        v.literal("missing"),
        v.literal("offline"),
        v.literal("ambiguous"),
        v.literal("unresolvable"),
        v.literal("socket_conflict"),
      ),
      reason: v.optional(v.string()),
      positionState: v.union(v.literal("current"), v.literal("historical")),
      projectionStatus: v.union(
        v.literal("idle"),
        v.literal("pending"),
        v.literal("running"),
        v.literal("success"),
        v.literal("blocked"),
        v.literal("error"),
      ),
      targetFloorId: v.optional(v.string()),
      targetPosition: v.optional(position),
      errorCode: v.optional(v.string()),
      nextAttemptAt: v.optional(v.number()),
    }),
  ),
});

export default defineSchema({
  sites: defineTable({
    objectId: v.string(),
    configKey: v.string(),
    displayName: v.string(),
    timezone: v.string(),
    enabled: v.boolean(),
    configVersion: v.number(),
    dayStartMinute: v.number(),
    dayEndMinute: v.number(),
    netboxInstanceKey: v.string(),
    netboxExternalSiteId: v.string(),
    netboxExternalSiteSlug: v.string(),
    libreNmsInstanceKey: v.string(),
    libreNmsDevices: v.array(
      v.object({
        externalId: v.string(),
        hostname: v.string(),
        networkName: v.string(),
        role: v.union(v.literal("access"), v.literal("core")),
        localizationTarget: v.boolean(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_object_id", ["objectId"])
    .index("by_config_key", ["configKey"])
    .index("by_netbox_site", ["netboxInstanceKey", "netboxExternalSiteId"]),

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

  integrationMapOperations: defineTable({
    opId: v.string(),
    idempotencyKey: v.string(),
    origin: v.literal("integration"),
    expectedCycleId: v.string(),
    deviceId: v.string(),
    status: v.union(
      v.literal("applied"),
      v.literal("already_applied"),
      v.literal("rejected"),
    ),
    reason: v.optional(v.string()),
    floors: v.array(
      v.object({
        floorId: v.string(),
        effect: v.union(
          v.literal("device-created"),
          v.literal("device-moved"),
          v.literal("device-removed"),
          v.literal("device-added"),
        ),
        revision: v.number(),
      }),
    ),
    createdAt: v.number(),
    appliedAt: v.number(),
  })
    .index("by_op_id", ["opId"])
    .index("by_idempotency_status", ["idempotencyKey", "status"]),

  externalObjectBindings: defineTable({
    siteId: v.string(),
    provider: v.literal("netbox"),
    instanceKey: v.string(),
    externalId: v.string(),
    deviceId: v.string(),
    floorId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_external", ["siteId", "provider", "instanceKey", "externalId"])
    .index("by_device", ["deviceId"])
    .index("by_floor", ["floorId"]),

  integrationWorkflowStates: defineTable({
    siteId: v.string(),
    workflow: integrationWorkflow,
    status: v.union(
      v.literal("idle"),
      v.literal("running"),
      v.literal("success"),
      v.literal("error"),
      v.literal("backoff"),
      v.literal("blocked"),
      v.literal("disabled"),
    ),
    fenceCounter: v.number(),
    activeAttemptId: v.optional(v.string()),
    activeOrigin: v.optional(
      v.union(v.literal("manual"), v.literal("scheduled")),
    ),
    lastAttemptAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastSuccessAttemptId: v.optional(v.string()),
    lastPublishedId: v.optional(v.string()),
    lastPrimaryCount: v.optional(v.number()),
    lastSecondaryCount: v.optional(v.number()),
    lastPublishedAt: v.optional(v.number()),
    nextScheduledAt: v.optional(v.number()),
    recentConfirmationMs: v.number(),
    backoffLevel: v.number(),
    backoffUntil: v.optional(v.number()),
    consecutiveFailures: v.optional(v.number()),
    timeoutMs: v.number(),
    switchProgress: v.array(
      v.object({
        externalId: v.string(),
        status: v.union(
          v.literal("pending"),
          v.literal("triggered"),
          v.literal("refreshing"),
          v.literal("success"),
          v.literal("error"),
          v.literal("timeout"),
          v.literal("uncertain"),
          v.literal("blocked"),
        ),
      }),
    ),
    publicError: v.optional(v.string()),
    configVersion: v.number(),
  })
    .index("by_site_workflow", ["siteId", "workflow"])
    .index("by_workflow_schedule", ["workflow", "nextScheduledAt"]),

  integrationAttempts: defineTable({
    siteId: v.string(),
    workflow: integrationWorkflow,
    attemptId: v.string(),
    origin: v.union(v.literal("manual"), v.literal("scheduled")),
    status: v.union(
      v.literal("running"),
      v.literal("success"),
      v.literal("error"),
      v.literal("abandoned"),
    ),
    fence: v.number(),
    leaseId: v.string(),
    startedAt: v.number(),
    leaseExpiresAt: v.number(),
    completedAt: v.optional(v.number()),
    configVersion: v.number(),
    pinnedNetBoxGenerationId: v.optional(v.string()),
    publishedId: v.optional(v.string()),
    publicError: v.optional(v.string()),
    privateErrorCode: v.optional(v.string()),
    privateErrorDetail: v.optional(v.string()),
    primaryCount: v.optional(v.number()),
    secondaryCount: v.optional(v.number()),
    supersededByAttemptId: v.optional(v.string()),
    retryCount: v.optional(v.number()),
  })
    .index("by_site_workflow_attempt", ["siteId", "workflow", "attemptId"])
    .index("by_site_workflow_started", ["siteId", "workflow", "startedAt"])
    .index("by_site_workflow_status", ["siteId", "workflow", "status"]),

  netboxGenerations: defineTable({
    siteId: v.string(),
    generationId: v.string(),
    attemptId: v.string(),
    instanceKey: v.string(),
    externalSiteId: v.string(),
    externalSiteSlug: v.string(),
    configVersion: v.number(),
    capturedAt: v.number(),
    publishedAt: v.number(),
    sourceVersion: v.optional(v.string()),
    inventoryCount: v.number(),
    connectionCount: v.number(),
    rackCount: v.number(),
    switchCount: v.number(),
    computerCount: v.number(),
    socketCount: v.number(),
  })
    .index("by_site_generation", ["siteId", "generationId"])
    .index("by_site_published", ["siteId", "publishedAt"])
    .index("by_attempt", ["siteId", "attemptId"]),

  netboxInventory: defineTable({
    siteId: v.string(),
    generationId: v.string(),
    instanceKey: v.string(),
    provider: v.literal("netbox"),
    externalId: v.string(),
    type: deviceType,
    name: v.string(),
    hostname: v.optional(v.string()),
    model: v.optional(v.string()),
    role: v.string(),
    location: v.optional(v.string()),
    locationPath: v.array(v.string()),
    ip: v.optional(v.string()),
    macs: v.array(v.string()),
    interfaceCount: v.number(),
    cabledTerminationCount: v.optional(v.number()),
    lifecycleStatus: v.string(),
    url: v.string(),
    sourceUpdatedAt: v.optional(v.string()),
    capturedAt: v.number(),
  })
    .index("by_generation", ["siteId", "generationId"])
    .index("by_generation_external", ["siteId", "generationId", "externalId"])
    .index("by_generation_type", ["siteId", "generationId", "type"]),

  netboxConnections: defineTable({
    siteId: v.string(),
    generationId: v.string(),
    instanceKey: v.string(),
    provider: v.literal("netbox"),
    externalId: v.string(),
    fromExternalId: v.string(),
    fromPort: v.optional(v.string()),
    fromTerminationExternalId: v.optional(v.string()),
    fromTerminationKind: v.optional(
      v.union(
        v.literal("interface"),
        v.literal("front-port"),
        v.literal("rear-port"),
        v.literal("other"),
      ),
    ),
    fromPeerTerminationExternalIds: v.optional(v.array(v.string())),
    toExternalId: v.string(),
    toPort: v.optional(v.string()),
    toTerminationExternalId: v.optional(v.string()),
    toTerminationKind: v.optional(
      v.union(
        v.literal("interface"),
        v.literal("front-port"),
        v.literal("rear-port"),
        v.literal("other"),
      ),
    ),
    toPeerTerminationExternalIds: v.optional(v.array(v.string())),
    kind: v.literal("physical"),
    capturedAt: v.number(),
  })
    .index("by_generation", ["siteId", "generationId"])
    .index("by_generation_external", ["siteId", "generationId", "externalId"])
    .index("by_generation_from", ["siteId", "generationId", "fromExternalId"])
    .index("by_generation_to", ["siteId", "generationId", "toExternalId"]),

  localizationSnapshots: defineTable({
    siteId: v.string(),
    snapshotId: v.string(),
    attemptId: v.string(),
    libreNmsInstanceKey: v.string(),
    netboxGenerationId: v.string(),
    configVersion: v.number(),
    capturedAt: v.number(),
    publishedAt: v.number(),
    observationCount: v.number(),
    linkCount: v.number(),
    netboxGenerationAgeMs: v.number(),
    netboxWarning: v.boolean(),
    switchResults: v.array(
      v.object({
        externalId: v.string(),
        status: v.literal("success"),
        observationCount: v.number(),
        discoveryGeneration: v.optional(v.string()),
        capturedAt: v.optional(v.number()),
        rawFdbCount: v.optional(v.number()),
        freshFdbCount: v.optional(v.number()),
        staleFdbCount: v.optional(v.number()),
        fdbConfirmation: v.optional(
          v.object({
            serverObservedAt: v.number(),
            rows: v.array(
              v.object({
                deviceId: v.string(),
                portId: v.number(),
                macAddress: v.string(),
                updatedAt: v.string(),
              }),
            ),
          }),
        ),
        triggerStartedAt: v.optional(v.number()),
        discoveryCompletedAt: v.optional(v.number()),
        serverObservedAt: v.optional(v.number()),
      }),
    ),
  })
    .index("by_site_snapshot", ["siteId", "snapshotId"])
    .index("by_site_published", ["siteId", "publishedAt"])
    .index("by_netbox_generation", ["siteId", "netboxGenerationId"])
    .index("by_attempt", ["siteId", "attemptId"]),

  localizationObservations: defineTable({
    siteId: v.string(),
    snapshotId: v.string(),
    externalId: v.string(),
    kind: v.union(v.literal("fdb"), v.literal("lldp")),
    libreNmsDeviceId: v.string(),
    portId: v.number(),
    portName: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    remoteHostname: v.optional(v.string()),
    sourceObservedAt: v.optional(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_snapshot", ["siteId", "snapshotId"])
    .index("by_snapshot_external", ["siteId", "snapshotId", "externalId"])
    .index("by_snapshot_switch", ["siteId", "snapshotId", "libreNmsDeviceId"]),

  localizationDiagnostics: defineTable({
    siteId: v.string(),
    snapshotId: v.string(),
    externalId: v.string(),
    reason: v.union(
      v.literal("incomplete_patch_panel_path"),
      v.literal("socket_without_cable"),
      v.literal("unknown_switch_port_in_netbox"),
      v.literal("switch_absent_from_site_configuration"),
      v.literal("conflicting_mac_inventory"),
    ),
    authoritative: v.boolean(),
    computerExternalId: v.optional(v.string()),
    socketExternalId: v.optional(v.string()),
    switchExternalId: v.optional(v.string()),
    switchPort: v.optional(v.string()),
    computerMac: v.optional(v.string()),
    libreNmsDeviceId: v.optional(v.string()),
    portId: v.optional(v.number()),
    observedAt: v.optional(v.number()),
  })
    .index("by_snapshot", ["siteId", "snapshotId"])
    .index("by_snapshot_computer", [
      "siteId",
      "snapshotId",
      "computerExternalId",
    ]),

  localizationLinks: defineTable({
    siteId: v.string(),
    snapshotId: v.string(),
    netboxGenerationId: v.string(),
    libreNmsInstanceKey: v.string(),
    provider: v.literal("librenms"),
    externalId: v.string(),
    computerExternalId: v.string(),
    socketExternalId: v.string(),
    switchExternalId: v.string(),
    switchPort: v.string(),
    computerMac: v.optional(v.string()),
    method: v.union(v.literal("fdb"), v.literal("lldp"), v.literal("fdb+lldp")),
    confidence: v.union(v.literal("high"), v.literal("medium")),
    observedAt: v.number(),
    cableExternalId: v.optional(v.string()),
    cableFromExternalId: v.optional(v.string()),
    cableFromPort: v.optional(v.string()),
    cableToExternalId: v.optional(v.string()),
    cableToPort: v.optional(v.string()),
    cablePathExternalIds: v.optional(v.array(v.string())),
    capturedAt: v.number(),
  })
    .index("by_snapshot", ["siteId", "snapshotId"])
    .index("by_snapshot_external", ["siteId", "snapshotId", "externalId"])
    .index("by_snapshot_computer", [
      "siteId",
      "snapshotId",
      "computerExternalId",
    ])
    .index("by_snapshot_socket", ["siteId", "snapshotId", "socketExternalId"]),

  switchRefreshStates: defineTable({
    siteId: v.string(),
    libreNmsDeviceId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("triggered"),
      v.literal("refreshing"),
      v.literal("success"),
      v.literal("error"),
      v.literal("timeout"),
      v.literal("uncertain"),
      v.literal("blocked"),
    ),
    lastAttemptId: v.optional(v.string()),
    activeAttemptId: v.optional(v.string()),
    fence: v.number(),
    leaseExpiresAt: v.optional(v.number()),
    triggerStartedAt: v.optional(v.number()),
    triggerAcceptedAt: v.optional(v.number()),
    pollingDeadlineAt: v.optional(v.number()),
    uncertainDeadlineAt: v.optional(v.number()),
    previousLastDiscovered: v.optional(v.string()),
    newLastDiscovered: v.optional(v.string()),
    lastDiscoveredTimetaken: v.optional(v.number()),
    stagedResultId: v.optional(v.string()),
    stagedCapturedAt: v.optional(v.number()),
    attemptCount: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    freshFdbCount: v.optional(v.number()),
    privateErrorCode: v.optional(v.string()),
    publicError: v.optional(v.string()),
  }).index("by_site_switch", ["siteId", "libreNmsDeviceId"]),

  localizationSwitchResults: defineTable({
    siteId: v.string(),
    attemptId: v.string(),
    resultId: v.string(),
    libreNmsDeviceId: v.string(),
    switchFence: v.number(),
    netboxGenerationId: v.string(),
    discoveryGeneration: v.string(),
    previousLastDiscovered: v.optional(v.string()),
    capturedAt: v.number(),
    observationCount: v.number(),
    attemptCount: v.number(),
    lastDiscoveredTimetaken: v.optional(v.number()),
  })
    .index("by_attempt_switch", ["siteId", "attemptId", "libreNmsDeviceId"])
    .index("by_result", ["siteId", "resultId"]),

  localizationStagedObservations: defineTable({
    siteId: v.string(),
    attemptId: v.string(),
    resultId: v.string(),
    externalId: v.string(),
    kind: v.union(v.literal("fdb"), v.literal("lldp")),
    libreNmsDeviceId: v.string(),
    portId: v.number(),
    portName: v.optional(v.string()),
    macAddress: v.optional(v.string()),
    remoteHostname: v.optional(v.string()),
    sourceObservedAt: v.optional(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_result", ["siteId", "resultId"])
    .index("by_attempt", ["siteId", "attemptId"]),

  computerLocations: defineTable({
    siteId: v.string(),
    computerExternalId: v.string(),
    state: v.union(
      v.literal("online"),
      v.literal("resolved_unplaced"),
      v.literal("missing"),
      v.literal("offline"),
      v.literal("ambiguous"),
      v.literal("unresolvable"),
      v.literal("socket_conflict"),
    ),
    decidingMac: v.optional(v.string()),
    socketExternalId: v.optional(v.string()),
    switchExternalId: v.optional(v.string()),
    switchPort: v.optional(v.string()),
    reason: v.optional(v.string()),
    firstPresentCycleId: v.optional(v.string()),
    lastPresentCycleId: v.optional(v.string()),
    consecutiveAbsences: v.number(),
    lastConfirmedSocketExternalId: v.optional(v.string()),
    observationUpdatedAt: v.optional(v.number()),
    lastKnownFloorId: v.optional(v.string()),
    lastKnownPosition: v.optional(position),
    visualExpiresAt: v.optional(v.number()),
    expiredAt: v.optional(v.number()),
    candidateSocketExternalIds: v.optional(v.array(v.string())),
    presentOnSocketSinceAt: v.optional(v.number()),
    lastPresenceAt: v.optional(v.number()),
    projectionStatus: v.union(
      v.literal("idle"),
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("blocked"),
      v.literal("error"),
    ),
    projectionCycleId: v.optional(v.string()),
    lastProjectedCycleId: v.optional(v.string()),
    projectionTargetFloorId: v.optional(v.string()),
    projectionTargetPosition: v.optional(position),
    projectionErrorCode: v.optional(v.string()),
    projectionNextAttemptAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_site_computer", ["siteId", "computerExternalId"])
    .index("by_site_state", ["siteId", "state"])
    .index("by_expiry_pending", ["expiredAt", "visualExpiresAt"])
    .index("by_state_expiry_pending", [
      "state",
      "expiredAt",
      "visualExpiresAt",
    ]),

  computerProjections: defineTable({
    siteId: v.string(),
    computerExternalId: v.string(),
    cycleId: v.string(),
    state: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("blocked"),
      v.literal("error"),
    ),
    fence: v.number(),
    leaseId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    attemptCount: v.number(),
    nextAttemptAt: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    socketExternalId: v.string(),
    socketDeviceId: v.string(),
    sourceFloorId: v.optional(v.string()),
    sourcePosition: v.optional(position),
    targetFloorId: v.string(),
    targetPosition: position,
    computer: v.object({
      instanceKey: v.string(),
      name: v.string(),
      hostname: v.optional(v.string()),
      ip: v.optional(v.string()),
      model: v.optional(v.string()),
      url: v.string(),
      location: v.optional(v.string()),
      locationPath: v.array(v.string()),
      role: v.string(),
      lifecycleStatus: v.string(),
      syncedAt: v.number(),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_site_computer", ["siteId", "computerExternalId"])
    .index("by_state_due", ["state", "nextAttemptAt"])
    .index("by_state_lease", ["state", "leaseExpiresAt"]),

  localizationCycles: defineTable({
    siteId: v.string(),
    cycleId: v.string(),
    attemptId: v.string(),
    origin: v.union(v.literal("manual"), v.literal("scheduled")),
    result: v.union(v.literal("success"), v.literal("error")),
    startedAt: v.number(),
    completedAt: v.number(),
    netboxGenerationId: v.string(),
    snapshotId: v.optional(v.string()),
    observedCount: v.number(),
    resolvedCount: v.number(),
    ambiguousCount: v.number(),
    unresolvableCount: v.number(),
    missingCount: v.number(),
    offlineCount: v.number(),
    retryCount: v.number(),
    backoffLevel: v.number(),
    errorCode: v.optional(v.string()),
    switchResults: v.array(
      v.object({
        externalId: v.string(),
        status: v.union(
          v.literal("success"),
          v.literal("error"),
          v.literal("timeout"),
          v.literal("uncertain"),
          v.literal("blocked"),
        ),
        attemptCount: v.number(),
        durationMs: v.optional(v.number()),
        freshFdbCount: v.optional(v.number()),
        errorCode: v.optional(v.string()),
      }),
    ),
  })
    .index("by_site_cycle", ["siteId", "cycleId"])
    .index("by_site_completed", ["siteId", "completedAt"]),

  localizationEvents: defineTable({
    siteId: v.string(),
    computerExternalId: v.string(),
    cycleId: v.string(),
    kind: v.union(
      v.literal("appeared"),
      v.literal("moved"),
      v.literal("missing"),
      v.literal("offline"),
      v.literal("returned"),
      v.literal("ambiguous"),
      v.literal("unresolvable"),
      v.literal("socket_conflict"),
      v.literal("expired"),
    ),
    occurredAt: v.number(),
    fromSocketExternalId: v.optional(v.string()),
    toSocketExternalId: v.optional(v.string()),
    reason: v.optional(v.string()),
  })
    .index("by_site_computer_time", [
      "siteId",
      "computerExternalId",
      "occurredAt",
    ])
    .index("by_site_cycle", ["siteId", "cycleId"]),

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
