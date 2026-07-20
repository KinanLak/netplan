import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  completeWorkflowSuccess,
  requireOwnedAttempt,
} from "./integrationModel";
import {
  normalizeMacAddress,
  normalizeNetworkDeviceName,
  normalizePortName,
  resolveLibreNmsTopology,
} from "./topology";
import type { TopologyResolutionDiagnostic } from "./topology";
import {
  classifyFdbTimestamp,
  normalizedFdbIdentitySet,
} from "./librenmsFreshness";
import { publishComputerLocations } from "./localizationModel";

export const discoveredConnectionInput = v.object({
  externalId: v.string(),
  computerExternalId: v.string(),
  socketExternalId: v.string(),
  switchExternalId: v.string(),
  switchPort: v.string(),
  computerMac: v.optional(v.string()),
  method: v.union(v.literal("fdb"), v.literal("lldp"), v.literal("fdb+lldp")),
  confidence: v.union(v.literal("high"), v.literal("medium")),
  observedAt: v.number(),
  cablePathExternalIds: v.array(v.string()),
});

export const observationInput = v.object({
  externalId: v.string(),
  kind: v.union(v.literal("fdb"), v.literal("lldp")),
  libreNmsDeviceId: v.string(),
  portId: v.number(),
  portName: v.optional(v.string()),
  macAddress: v.optional(v.string()),
  remoteHostname: v.optional(v.string()),
  sourceObservedAt: v.optional(v.string()),
  fetchedAt: v.number(),
});

export const resolutionDiagnosticInput = v.object({
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
});

export const switchResultInput = v.object({
  externalId: v.string(),
  status: v.literal("success"),
  observationCount: v.number(),
  discoveryGeneration: v.optional(v.string()),
  capturedAt: v.optional(v.number()),
  rawFdbCount: v.number(),
  freshFdbCount: v.number(),
  staleFdbCount: v.number(),
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
  triggerStartedAt: v.number(),
  discoveryCompletedAt: v.number(),
  serverObservedAt: v.number(),
});

const assertUnique = (
  items: ReadonlyArray<{ externalId: string }>,
  collection: string,
) => {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.externalId)) {
      throw new ConvexError(`Duplicate external ID in ${collection}`);
    }
    ids.add(item.externalId);
  }
};

const hostnameKey = (value: string): string =>
  value.split(".")[0].toLowerCase();

export const publishSnapshot = internalMutation({
  args: {
    siteId: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
    snapshotId: v.string(),
    netboxGenerationId: v.string(),
    libreNmsInstanceKey: v.string(),
    capturedAt: v.number(),
    switchResults: v.array(switchResultInput),
    observations: v.array(observationInput),
    discoveries: v.array(discoveredConnectionInput),
    diagnostics: v.array(resolutionDiagnosticInput),
    stagingRequired: v.optional(v.boolean()),
  },
  returns: v.object({
    snapshotId: v.string(),
    observationCount: v.number(),
    linkCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const existingSnapshot = await ctx.db
      .query("localizationSnapshots")
      .withIndex("by_site_snapshot", (q) =>
        q.eq("siteId", args.siteId).eq("snapshotId", args.snapshotId),
      )
      .unique();
    if (existingSnapshot) {
      if (existingSnapshot.attemptId !== args.attemptId) {
        throw new ConvexError("Localization snapshot identity already exists");
      }
      return {
        snapshotId: existingSnapshot.snapshotId,
        observationCount: existingSnapshot.observationCount,
        linkCount: existingSnapshot.linkCount,
      };
    }

    const { state, attempt, site } = await requireOwnedAttempt(ctx, {
      ...args,
      workflow: "localization",
    });
    if (args.libreNmsInstanceKey !== site.libreNmsInstanceKey) {
      throw new ConvexError("LibreNMS payload belongs to another instance");
    }
    if (
      !attempt.pinnedNetBoxGenerationId ||
      attempt.pinnedNetBoxGenerationId !== args.netboxGenerationId
    ) {
      throw new ConvexError("Localization used an unpinned NetBox generation");
    }
    const generation = await ctx.db
      .query("netboxGenerations")
      .withIndex("by_site_generation", (q) =>
        q.eq("siteId", args.siteId).eq("generationId", args.netboxGenerationId),
      )
      .unique();
    if (!generation) throw new ConvexError("Pinned NetBox generation missing");

    assertUnique(args.switchResults, "switch results");
    assertUnique(args.observations, "observations");
    assertUnique(args.discoveries, "discoveries");
    assertUnique(args.diagnostics, "diagnostics");
    const expectedTargets = site.libreNmsDevices
      .filter((device) => device.localizationTarget)
      .map((device) => device.externalId)
      .sort();
    const receivedTargets = args.switchResults
      .map((result) => result.externalId)
      .sort();
    if (JSON.stringify(expectedTargets) !== JSON.stringify(receivedTargets)) {
      throw new ConvexError("Localization snapshot is missing a target switch");
    }
    const targetSet = new Set(expectedTargets);
    const observationsBySwitch = new Map<string, number>();
    const fdbBySwitch = new Map<
      string,
      Array<(typeof args.observations)[number]>
    >();
    for (const observation of args.observations) {
      if (targetSet.has(observation.libreNmsDeviceId)) {
        observationsBySwitch.set(
          observation.libreNmsDeviceId,
          (observationsBySwitch.get(observation.libreNmsDeviceId) ?? 0) + 1,
        );
      }
      if (observation.kind !== "fdb") continue;
      if (
        observation.macAddress === undefined ||
        !normalizeMacAddress(observation.macAddress)
      ) {
        throw new ConvexError("FDB observation has an invalid MAC address");
      }
      const rows = fdbBySwitch.get(observation.libreNmsDeviceId) ?? [];
      rows.push(observation);
      fdbBySwitch.set(observation.libreNmsDeviceId, rows);
    }
    const validatedSwitchResults = args.switchResults.map((result) => {
      const counts = [
        result.observationCount,
        result.rawFdbCount,
        result.freshFdbCount,
        result.staleFdbCount,
      ];
      const bounds = [
        result.triggerStartedAt,
        result.discoveryCompletedAt,
        result.serverObservedAt,
      ];
      if (
        counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
        bounds.some((bound) => !Number.isFinite(bound)) ||
        result.triggerStartedAt > result.discoveryCompletedAt + 60_000 ||
        result.discoveryCompletedAt > result.serverObservedAt + 60_000
      ) {
        throw new ConvexError("Switch freshness evidence is invalid");
      }
      const rows = fdbBySwitch.get(result.externalId) ?? [];
      const freshFdbCount = rows.filter(
        (observation) =>
          classifyFdbTimestamp(observation.sourceObservedAt, {
            externalId: result.externalId,
            triggerStartedAt: result.triggerStartedAt,
            discoveryCompletedAt: result.discoveryCompletedAt,
            serverObservedAt: result.serverObservedAt,
          }).fresh,
      ).length;
      const rawFdbCount = rows.length;
      const staleFdbCount = rawFdbCount - freshFdbCount;
      if (
        result.observationCount !==
          (observationsBySwitch.get(result.externalId) ?? 0) ||
        result.rawFdbCount !== rawFdbCount ||
        result.freshFdbCount !== freshFdbCount ||
        result.staleFdbCount !== staleFdbCount
      ) {
        throw new ConvexError("Switch freshness counts are inconsistent");
      }
      if (result.fdbConfirmation) {
        const confirmation = result.fdbConfirmation;
        if (
          !Number.isFinite(confirmation.serverObservedAt) ||
          confirmation.serverObservedAt + 60_000 <
            result.discoveryCompletedAt ||
          confirmation.rows.some(
            (row) =>
              row.deviceId !== result.externalId ||
              !Number.isSafeInteger(row.portId) ||
              row.portId < 0 ||
              !normalizeMacAddress(row.macAddress),
          ) ||
          normalizedFdbIdentitySet(confirmation.rows) === undefined
        ) {
          throw new ConvexError("FDB confirmation evidence is invalid");
        }
        const primaryFreshRows = rows.flatMap((observation) => {
          const freshness = classifyFdbTimestamp(observation.sourceObservedAt, {
            externalId: result.externalId,
            triggerStartedAt: result.triggerStartedAt,
            discoveryCompletedAt: result.discoveryCompletedAt,
            serverObservedAt: result.serverObservedAt,
          });
          return freshness.fresh && observation.sourceObservedAt
            ? [
                {
                  deviceId: observation.libreNmsDeviceId,
                  portId: observation.portId,
                  macAddress: observation.macAddress!,
                  updatedAt: observation.sourceObservedAt,
                },
              ]
            : [];
        });
        const confirmedFreshRows = confirmation.rows.filter(
          (row) =>
            classifyFdbTimestamp(row.updatedAt, {
              externalId: result.externalId,
              triggerStartedAt: result.triggerStartedAt,
              discoveryCompletedAt: result.discoveryCompletedAt,
              serverObservedAt: confirmation.serverObservedAt,
            }).fresh,
        );
        const primarySet = normalizedFdbIdentitySet(primaryFreshRows);
        const confirmationSet = normalizedFdbIdentitySet(confirmedFreshRows);
        if (
          !primarySet ||
          !confirmationSet ||
          JSON.stringify(primarySet) !== JSON.stringify(confirmationSet)
        ) {
          throw new ConvexError("Low FDB count lacks a stable confirmation");
        }
      }
      return { ...result, rawFdbCount, freshFdbCount, staleFdbCount };
    });
    if (args.stagingRequired) {
      const staged = await ctx.db
        .query("localizationSwitchResults")
        .withIndex("by_attempt_switch", (q) =>
          q.eq("siteId", args.siteId).eq("attemptId", args.attemptId),
        )
        .collect();
      if (
        staged.length !== expectedTargets.length ||
        !staged.every(
          (result) =>
            expectedTargets.includes(result.libreNmsDeviceId) &&
            result.netboxGenerationId === args.netboxGenerationId &&
            args.switchResults.some(
              (received) =>
                received.externalId === result.libreNmsDeviceId &&
                received.discoveryGeneration === result.discoveryGeneration &&
                received.capturedAt === result.capturedAt &&
                received.observationCount === result.observationCount,
            ),
        )
      ) {
        throw new ConvexError("Localization staging is incomplete");
      }
      const captures = staged.map((result) => result.capturedAt);
      if (Math.max(...captures) - Math.min(...captures) > 5 * 60 * 1000) {
        throw new ConvexError("Localization staging coherence window expired");
      }
      for (const result of staged) {
        const refresh = await ctx.db
          .query("switchRefreshStates")
          .withIndex("by_site_switch", (q) =>
            q
              .eq("siteId", args.siteId)
              .eq("libreNmsDeviceId", result.libreNmsDeviceId),
          )
          .unique();
        if (
          !refresh ||
          refresh.fence !== result.switchFence ||
          refresh.stagedResultId !== result.resultId
        ) {
          throw new ConvexError("Localization switch staging was replaced");
        }
      }
      const stagedObservations = await ctx.db
        .query("localizationStagedObservations")
        .withIndex("by_attempt", (q) =>
          q.eq("siteId", args.siteId).eq("attemptId", args.attemptId),
        )
        .collect();
      const stagedIds = new Set(
        stagedObservations.map((observation) => observation.externalId),
      );
      if (
        stagedIds.size !== args.observations.length ||
        args.observations.some(
          (observation) => !stagedIds.has(observation.externalId),
        )
      ) {
        throw new ConvexError("Localization observations differ from staging");
      }
    }
    const previousSnapshot = state.lastPublishedId
      ? await ctx.db
          .query("localizationSnapshots")
          .withIndex("by_site_snapshot", (q) =>
            q
              .eq("siteId", args.siteId)
              .eq("snapshotId", state.lastPublishedId as string),
          )
          .unique()
      : null;
    for (const result of validatedSwitchResults) {
      const previousCount = previousSnapshot?.switchResults.find(
        (item) => item.externalId === result.externalId,
      )?.freshFdbCount;
      if (
        previousCount &&
        (result.freshFdbCount === 0 ||
          result.freshFdbCount / previousCount <= 0.2) &&
        !result.fdbConfirmation
      ) {
        throw new ConvexError("Low FDB count lacks a stable confirmation");
      }
    }

    const [inventory, connections] = await Promise.all([
      ctx.db
        .query("netboxInventory")
        .withIndex("by_generation", (q) =>
          q
            .eq("siteId", args.siteId)
            .eq("generationId", args.netboxGenerationId),
        )
        .collect(),
      ctx.db
        .query("netboxConnections")
        .withIndex("by_generation", (q) =>
          q
            .eq("siteId", args.siteId)
            .eq("generationId", args.netboxGenerationId),
        )
        .collect(),
    ]);
    const inventoryById = new Map(
      inventory.map((item) => [item.externalId, item]),
    );
    const resolutionFdb = args.observations.flatMap((observation) => {
      if (observation.kind !== "fdb" || !observation.macAddress) return [];
      const result = validatedSwitchResults.find(
        (item) => item.externalId === observation.libreNmsDeviceId,
      );
      if (!result) {
        return observation.sourceObservedAt
          ? [
              {
                deviceId: Number(observation.libreNmsDeviceId),
                portId: observation.portId,
                macAddress: observation.macAddress,
                updatedAt: observation.sourceObservedAt,
                authoritative: false,
              },
            ]
          : [];
      }
      const freshness = classifyFdbTimestamp(observation.sourceObservedAt, {
        externalId: result.externalId,
        triggerStartedAt: result.triggerStartedAt,
        discoveryCompletedAt: result.discoveryCompletedAt,
        serverObservedAt: result.serverObservedAt,
      });
      return freshness.fresh
        ? [
            {
              deviceId: Number(observation.libreNmsDeviceId),
              portId: observation.portId,
              macAddress: observation.macAddress,
              updatedAt: observation.sourceObservedAt,
              authoritative: true,
            },
          ]
        : [];
    });
    const portKeys = new Set<string>();
    const resolutionPorts = args.observations.flatMap((observation) => {
      if (!observation.portName) return [];
      const key = `${observation.libreNmsDeviceId}\0${observation.portId}`;
      if (portKeys.has(key)) return [];
      portKeys.add(key);
      return [
        {
          deviceId: Number(observation.libreNmsDeviceId),
          portId: observation.portId,
          ifName: observation.portName,
        },
      ];
    });
    const expectedResolution = resolveLibreNmsTopology({
      inventory: inventory.map((item) => ({
        ...item,
        cabledTerminationCount: item.cabledTerminationCount ?? 0,
      })),
      physicalConnections: connections.map((connection) => ({
        ...connection,
        fromTerminationExternalId:
          connection.fromTerminationExternalId ??
          `legacy:${connection.externalId}:from`,
        fromTerminationKind:
          connection.fromTerminationKind ?? ("interface" as const),
        fromPeerTerminationExternalIds:
          connection.fromPeerTerminationExternalIds ?? [],
        toTerminationExternalId:
          connection.toTerminationExternalId ??
          `legacy:${connection.externalId}:to`,
        toTerminationKind:
          connection.toTerminationKind ?? ("interface" as const),
        toPeerTerminationExternalIds:
          connection.toPeerTerminationExternalIds ?? [],
      })),
      configuredSwitches: site.libreNmsDevices.map((device) => ({
        externalId: device.externalId,
        networkName: device.networkName,
      })),
      ports: resolutionPorts,
      fdb: resolutionFdb,
      lldp: args.observations.flatMap((observation) =>
        observation.kind === "lldp" && observation.remoteHostname
          ? [
              {
                localDeviceId: Number(observation.libreNmsDeviceId),
                localPortId: observation.portId,
                remoteHostname: observation.remoteHostname,
              },
            ]
          : [],
      ),
      syncedAt: args.capturedAt,
    });
    const diagnosticSignature = (diagnostic: TopologyResolutionDiagnostic) =>
      JSON.stringify([
        diagnostic.externalId,
        diagnostic.reason,
        diagnostic.authoritative,
        diagnostic.computerExternalId,
        diagnostic.socketExternalId,
        diagnostic.switchExternalId,
        diagnostic.switchPort,
        diagnostic.computerMac,
        diagnostic.libreNmsDeviceId,
        diagnostic.portId,
        diagnostic.observedAt,
      ]);
    const receivedDiagnostics = args.diagnostics
      .map(diagnosticSignature)
      .sort();
    const expectedDiagnostics = expectedResolution.diagnostics
      .map(diagnosticSignature)
      .sort();
    if (
      JSON.stringify(receivedDiagnostics) !==
      JSON.stringify(expectedDiagnostics)
    ) {
      throw new ConvexError(
        "Localization diagnostics do not match source evidence",
      );
    }
    const validatedDiscoveries: typeof args.discoveries = [];
    for (const discovery of args.discoveries) {
      const computer = inventoryById.get(discovery.computerExternalId);
      const socket = inventoryById.get(discovery.socketExternalId);
      const networkSwitch = inventoryById.get(discovery.switchExternalId);
      if (!computer || !socket || !networkSwitch) {
        throw new ConvexError(
          "Localization references inventory outside its pinned generation",
        );
      }
      if (
        computer.type !== "pc" ||
        socket.type !== "wall-port" ||
        networkSwitch.type !== "switch"
      ) {
        throw new ConvexError("Localization endpoint types are invalid");
      }
      const computerMac = discovery.computerMac
        ? normalizeMacAddress(discovery.computerMac)
        : "";
      if (!computerMac) {
        throw new ConvexError("Localization link has an invalid MAC address");
      }
      const candidateObservations = args.observations.filter((observation) => {
        const configuredSwitch = site.libreNmsDevices.find(
          (device) => device.externalId === observation.libreNmsDeviceId,
        );
        return (
          configuredSwitch?.localizationTarget === true &&
          normalizeNetworkDeviceName(configuredSwitch.networkName) ===
            normalizeNetworkDeviceName(networkSwitch.name) &&
          observation.portName !== undefined &&
          normalizePortName(observation.portName) ===
            normalizePortName(discovery.switchPort)
        );
      });
      const supportingFdb = candidateObservations.flatMap((observation) => {
        if (
          observation.kind !== "fdb" ||
          observation.macAddress === undefined ||
          normalizeMacAddress(observation.macAddress) !== computerMac
        ) {
          return [];
        }
        const result = validatedSwitchResults.find(
          (item) => item.externalId === observation.libreNmsDeviceId,
        );
        if (!result) return [];
        const freshness = classifyFdbTimestamp(observation.sourceObservedAt, {
          externalId: result.externalId,
          triggerStartedAt: result.triggerStartedAt,
          discoveryCompletedAt: result.discoveryCompletedAt,
          serverObservedAt: result.serverObservedAt,
        });
        return freshness.fresh && freshness.observedAt !== undefined
          ? [freshness.observedAt]
          : [];
      });
      const computerHostname = computer.hostname ?? computer.name;
      const hasLldpProof = candidateObservations.some(
        (observation) =>
          observation.kind === "lldp" &&
          observation.remoteHostname !== undefined &&
          hostnameKey(observation.remoteHostname) ===
            hostnameKey(computerHostname),
      );
      if (
        (discovery.method === "fdb" && supportingFdb.length === 0) ||
        discovery.method === "lldp" ||
        (discovery.method === "fdb+lldp" &&
          (supportingFdb.length === 0 || !hasLldpProof))
      ) {
        throw new ConvexError(
          "Localization has no supporting network observation",
        );
      }
      const expectedDiscovery = expectedResolution.discoveries.find(
        (expected) =>
          expected.computerExternalId === discovery.computerExternalId &&
          expected.socketExternalId === discovery.socketExternalId &&
          expected.switchExternalId === discovery.switchExternalId &&
          normalizePortName(expected.switchPort) ===
            normalizePortName(discovery.switchPort) &&
          JSON.stringify(expected.cablePathExternalIds) ===
            JSON.stringify(discovery.cablePathExternalIds),
      );
      if (!expectedDiscovery) {
        throw new ConvexError("Localization has no pinned NetBox path proof");
      }
      validatedDiscoveries.push({
        ...discovery,
        computerMac,
        observedAt: Math.max(...supportingFdb),
      });
    }

    const publishedAt = Date.now();
    const netboxGenerationAgeMs = Math.max(
      0,
      publishedAt - generation.publishedAt,
    );
    await ctx.db.insert("localizationSnapshots", {
      siteId: args.siteId,
      snapshotId: args.snapshotId,
      attemptId: args.attemptId,
      libreNmsInstanceKey: args.libreNmsInstanceKey,
      netboxGenerationId: args.netboxGenerationId,
      configVersion: attempt.configVersion,
      capturedAt: args.capturedAt,
      publishedAt,
      observationCount: args.observations.length,
      linkCount: validatedDiscoveries.length,
      netboxGenerationAgeMs,
      netboxWarning: netboxGenerationAgeMs >= 24 * 60 * 60 * 1000,
      switchResults: validatedSwitchResults,
    });
    for (const observation of args.observations) {
      await ctx.db.insert("localizationObservations", {
        siteId: args.siteId,
        snapshotId: args.snapshotId,
        ...observation,
      });
    }
    for (const diagnostic of expectedResolution.diagnostics) {
      await ctx.db.insert("localizationDiagnostics", {
        siteId: args.siteId,
        snapshotId: args.snapshotId,
        ...diagnostic,
      });
    }
    for (const discovery of validatedDiscoveries) {
      await ctx.db.insert("localizationLinks", {
        siteId: args.siteId,
        snapshotId: args.snapshotId,
        netboxGenerationId: args.netboxGenerationId,
        libreNmsInstanceKey: args.libreNmsInstanceKey,
        provider: "librenms",
        ...discovery,
        capturedAt: args.capturedAt,
      });
    }
    const cycleOccurredAt = Math.max(
      publishedAt,
      ...validatedSwitchResults.map((result) => result.discoveryCompletedAt),
    );
    const locationCounts = await publishComputerLocations(ctx, {
      siteId: args.siteId,
      cycleId: args.attemptId,
      occurredAt: cycleOccurredAt,
      inventory,
      observations: args.observations,
      switchResults: validatedSwitchResults,
      candidates: validatedDiscoveries,
      diagnostics: expectedResolution.diagnostics,
    });
    const refreshStates = (
      await ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", args.siteId))
        .collect()
    ).filter((switchState) => switchState.lastAttemptId === args.attemptId);
    for (const result of validatedSwitchResults) {
      const refreshState = refreshStates.find(
        (switchState) => switchState.libreNmsDeviceId === result.externalId,
      );
      if (!refreshState) continue;
      await ctx.db.patch(refreshState._id, {
        status: "success",
        activeAttemptId: undefined,
        completedAt: publishedAt,
        durationMs: refreshState.startedAt
          ? publishedAt - refreshState.startedAt
          : undefined,
        newLastDiscovered: result.discoveryGeneration,
        stagedCapturedAt: result.capturedAt,
        freshFdbCount: result.freshFdbCount,
        publicError: undefined,
        privateErrorCode: undefined,
      });
    }
    await ctx.db.insert("localizationCycles", {
      siteId: args.siteId,
      cycleId: args.attemptId,
      attemptId: args.attemptId,
      origin: attempt.origin,
      result: "success",
      startedAt: attempt.startedAt,
      completedAt: publishedAt,
      netboxGenerationId: args.netboxGenerationId,
      snapshotId: args.snapshotId,
      observedCount: args.observations.length,
      resolvedCount: locationCounts.resolvedCount,
      ambiguousCount: locationCounts.ambiguousCount,
      unresolvableCount: locationCounts.unresolvableCount,
      missingCount: locationCounts.missingCount,
      offlineCount: locationCounts.offlineCount,
      retryCount: refreshStates
        .filter((switchState) =>
          validatedSwitchResults.some(
            (result) => result.externalId === switchState.libreNmsDeviceId,
          ),
        )
        .reduce(
          (count, switchState) =>
            count + Math.max(0, switchState.attemptCount - 1),
          0,
        ),
      backoffLevel: 0,
      switchResults: validatedSwitchResults.map((result) => {
        const refresh = refreshStates.find(
          (switchState) => switchState.libreNmsDeviceId === result.externalId,
        );
        return {
          externalId: result.externalId,
          status: "success" as const,
          attemptCount: refresh?.attemptCount ?? 1,
          durationMs: refresh?.durationMs,
          freshFdbCount: result.freshFdbCount,
        };
      }),
    });
    await completeWorkflowSuccess(ctx, {
      siteId: args.siteId,
      workflow: "localization",
      attemptId: args.attemptId,
      leaseId: args.leaseId,
      fence: args.fence,
      publishedId: args.snapshotId,
      primaryCount: args.observations.length,
      secondaryCount: validatedDiscoveries.length,
    });
    return {
      snapshotId: args.snapshotId,
      observationCount: args.observations.length,
      linkCount: validatedDiscoveries.length,
    };
  },
});
