import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  invalidateProjectionTarget,
  publishProjectionTarget,
} from "./computerProjection";
import { classifyFdbTimestamp } from "./librenmsFreshness";
import { normalizeMacAddress } from "./topology";
import type { TopologyResolutionDiagnostic } from "./topology";
import { bumpComputerPresentationRevision } from "./computerPresentation";

const VISUAL_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;

interface Observation {
  kind: "fdb" | "lldp";
  libreNmsDeviceId: string;
  macAddress?: string;
  sourceObservedAt?: string;
}

interface SwitchResult {
  externalId: string;
  triggerStartedAt?: number;
  discoveryCompletedAt?: number;
  serverObservedAt?: number;
}

interface Candidate {
  computerExternalId: string;
  socketExternalId: string;
  switchExternalId: string;
  switchPort: string;
  computerMac?: string;
  observedAt: number;
}

interface Decision {
  computer: Doc<"netboxInventory">;
  present: boolean;
  candidates: Array<Candidate>;
  selected?: Candidate;
  state:
    | "online"
    | "resolved_unplaced"
    | "missing"
    | "offline"
    | "ambiguous"
    | "unresolvable"
    | "socket_conflict";
  reason?: string;
  presentOnSocketSinceAt?: number;
  decidingMac?: string;
  observationUpdatedAt?: number;
}

export const localizationEventKinds = (
  previous: Pick<
    Doc<"computerLocations">,
    | "state"
    | "lastPresentCycleId"
    | "expiredAt"
    | "consecutiveAbsences"
    | "lastConfirmedSocketExternalId"
  > | null,
  decision: Pick<Decision, "present" | "state" | "selected">,
): Array<Doc<"localizationEvents">["kind"]> => {
  if (!decision.present) {
    if (decision.state === "offline" && previous?.state !== "offline") {
      return ["offline"];
    }
    if (decision.state === "missing" && previous?.state !== "missing") {
      return ["missing"];
    }
    return [];
  }
  if (decision.state === "ambiguous" && previous?.state !== "ambiguous") {
    return ["ambiguous"];
  }
  if (decision.state === "unresolvable" && previous?.state !== "unresolvable") {
    return ["unresolvable"];
  }
  if (
    decision.state === "socket_conflict" &&
    previous?.state !== "socket_conflict"
  ) {
    return ["socket_conflict"];
  }
  if (decision.state === "socket_conflict") return [];
  if (!previous || !previous.lastPresentCycleId) return ["appeared"];
  const kinds: Array<Doc<"localizationEvents">["kind"]> = [];
  if (previous.expiredAt !== undefined || previous.consecutiveAbsences > 0) {
    kinds.push("returned");
  }
  if (
    decision.selected &&
    previous.lastConfirmedSocketExternalId &&
    previous.lastConfirmedSocketExternalId !==
      decision.selected.socketExternalId
  ) {
    kinds.push("moved");
  }
  return kinds;
};

export const socketConflictReason = (
  presentOnSocketSinceAt: number,
  newestPresenceAt: number,
  newestPresenceCount: number,
): "socket_presence_time_tie" | "socket_occupied_by_newer_presence" =>
  presentOnSocketSinceAt === newestPresenceAt && newestPresenceCount > 1
    ? "socket_presence_time_tie"
    : "socket_occupied_by_newer_presence";

export const publishComputerLocations = async (
  ctx: MutationCtx,
  args: {
    siteId: string;
    cycleId: string;
    occurredAt: number;
    inventory: Array<Doc<"netboxInventory">>;
    observations: Array<Observation>;
    switchResults: Array<SwitchResult>;
    candidates: Array<Candidate>;
    diagnostics: Array<TopologyResolutionDiagnostic>;
  },
) => {
  const computers = args.inventory.filter((item) => item.type === "pc");
  const [existingRows, bindings] = await Promise.all([
    ctx.db
      .query("computerLocations")
      .withIndex("by_site_computer", (q) => q.eq("siteId", args.siteId))
      .collect(),
    ctx.db
      .query("externalObjectBindings")
      .withIndex("by_external", (q) => q.eq("siteId", args.siteId))
      .collect(),
  ]);
  const existingByComputer = new Map(
    existingRows.map((row) => [row.computerExternalId, row]),
  );
  const inventoryByExternalId = new Map(
    args.inventory.map((item) => [item.externalId, item]),
  );
  const bindingDevices = await Promise.all(
    bindings.map((binding) =>
      ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", binding.deviceId))
        .unique(),
    ),
  );
  const socketBindingsByExternalId = new Map<string, Array<Doc<"devices">>>();
  bindings.forEach((binding, index) => {
    const inventory = inventoryByExternalId.get(binding.externalId);
    const device = bindingDevices[index];
    if (
      inventory?.type !== "wall-port" ||
      inventory.instanceKey !== binding.instanceKey ||
      device?.type !== "wall-port" ||
      device.floorId !== binding.floorId
    ) {
      return;
    }
    const devices = socketBindingsByExternalId.get(binding.externalId) ?? [];
    devices.push(device);
    socketBindingsByExternalId.set(binding.externalId, devices);
  });
  const placedSocketDevices = new Map(
    [...socketBindingsByExternalId].flatMap(([externalId, devices]) =>
      devices.length === 1 ? [[externalId, devices[0]]] : [],
    ),
  );

  const currentComputerIds = new Set(computers.map((item) => item.externalId));
  for (const previous of existingRows) {
    if (currentComputerIds.has(previous.computerExternalId)) continue;
    const consecutiveAbsences = previous.consecutiveAbsences + 1;
    const state = consecutiveAbsences >= 2 ? "offline" : "missing";
    const nextExpiry =
      previous.lastPresenceAt === undefined
        ? undefined
        : previous.lastPresenceAt + VISUAL_RETENTION_MS;
    await ctx.db.patch(previous._id, {
      state,
      reason: "absent_from_current_inventory",
      socketExternalId: undefined,
      switchExternalId: undefined,
      switchPort: undefined,
      consecutiveAbsences,
      visualExpiresAt: nextExpiry,
      projectionStatus: "idle",
      projectionCycleId: undefined,
      projectionTargetFloorId: undefined,
      projectionTargetPosition: undefined,
      projectionErrorCode: undefined,
      projectionNextAttemptAt: undefined,
      updatedAt: args.occurredAt,
    });
    await invalidateProjectionTarget(
      ctx,
      args.siteId,
      previous.computerExternalId,
    );
    if (previous.state !== state) {
      await ctx.db.insert("localizationEvents", {
        siteId: args.siteId,
        computerExternalId: previous.computerExternalId,
        cycleId: args.cycleId,
        kind: state,
        occurredAt: args.occurredAt,
        fromSocketExternalId: previous.lastConfirmedSocketExternalId,
        reason: "absent_from_current_inventory",
      });
    }
    await bumpComputerPresentationRevision(
      ctx,
      args.siteId,
      previous.computerExternalId,
      args.occurredAt,
    );
  }
  const computerIdsByMac = new Map<string, Set<string>>();
  for (const computer of computers) {
    for (const value of computer.macs) {
      const mac = normalizeMacAddress(value);
      if (!mac) continue;
      const owners = computerIdsByMac.get(mac) ?? new Set<string>();
      owners.add(computer.externalId);
      computerIdsByMac.set(mac, owners);
    }
  }
  const presentComputerIds = new Set<string>();
  const conflictedComputerIds = new Set<string>();
  const latestObservationByComputer = new Map<
    string,
    { macAddress: string; observedAt: number }
  >();
  for (const observation of args.observations) {
    if (observation.kind !== "fdb" || !observation.macAddress) continue;
    const result = args.switchResults.find(
      (item) => item.externalId === observation.libreNmsDeviceId,
    );
    const freshness =
      result &&
      result.triggerStartedAt !== undefined &&
      result.discoveryCompletedAt !== undefined &&
      result.serverObservedAt !== undefined
        ? classifyFdbTimestamp(observation.sourceObservedAt, {
            externalId: result.externalId,
            triggerStartedAt: result.triggerStartedAt,
            discoveryCompletedAt: result.discoveryCompletedAt,
            serverObservedAt: result.serverObservedAt,
          })
        : undefined;
    if (!result || !freshness?.fresh || freshness.observedAt === undefined) {
      continue;
    }
    const macAddress = normalizeMacAddress(observation.macAddress);
    const owners = computerIdsByMac.get(macAddress);
    if (!owners) continue;
    for (const owner of owners) {
      presentComputerIds.add(owner);
      const latest = latestObservationByComputer.get(owner);
      if (!latest || freshness.observedAt > latest.observedAt) {
        latestObservationByComputer.set(owner, {
          macAddress,
          observedAt: freshness.observedAt,
        });
      }
    }
    if (owners.size > 1) {
      for (const owner of owners) conflictedComputerIds.add(owner);
    }
  }
  const candidatesByComputer = new Map<string, Array<Candidate>>();
  for (const candidate of args.candidates) {
    const values = candidatesByComputer.get(candidate.computerExternalId) ?? [];
    if (
      !values.some(
        (item) => item.socketExternalId === candidate.socketExternalId,
      )
    ) {
      values.push(candidate);
    }
    candidatesByComputer.set(candidate.computerExternalId, values);
  }
  const diagnosticByComputer = new Map<string, TopologyResolutionDiagnostic>();
  for (const diagnostic of args.diagnostics) {
    if (!diagnostic.authoritative || !diagnostic.computerExternalId) continue;
    const previous = diagnosticByComputer.get(diagnostic.computerExternalId);
    if ((diagnostic.observedAt ?? 0) >= (previous?.observedAt ?? 0)) {
      diagnosticByComputer.set(diagnostic.computerExternalId, diagnostic);
    }
  }

  const decisions: Array<Decision> = computers.map((computer) => {
    const previous = existingByComputer.get(computer.externalId) ?? null;
    const present = presentComputerIds.has(computer.externalId);
    const candidates = candidatesByComputer.get(computer.externalId) ?? [];
    const latestObservation = latestObservationByComputer.get(
      computer.externalId,
    );
    if (!present) {
      const consecutiveAbsences = (previous?.consecutiveAbsences ?? 0) + 1;
      return {
        computer,
        present,
        candidates,
        state: consecutiveAbsences >= 2 ? "offline" : "missing",
        decidingMac: previous?.decidingMac,
        observationUpdatedAt: previous?.observationUpdatedAt,
      };
    }
    if (conflictedComputerIds.has(computer.externalId)) {
      return {
        computer,
        present,
        candidates,
        state: "unresolvable",
        reason: "conflicting_mac_inventory",
        decidingMac: latestObservation?.macAddress,
        observationUpdatedAt: latestObservation?.observedAt,
      };
    }
    let selected: Candidate | undefined;
    if (candidates.length === 1) selected = candidates[0];
    else if (candidates.length > 1 && previous?.lastConfirmedSocketExternalId) {
      selected = candidates.find(
        (candidate) =>
          candidate.socketExternalId === previous.lastConfirmedSocketExternalId,
      );
    }
    if (!selected) {
      const diagnostic = diagnosticByComputer.get(computer.externalId);
      if (candidates.length === 0 && !diagnostic) {
        throw new Error("Fresh MAC lacks a topology resolution diagnostic");
      }
      return {
        computer,
        present,
        candidates,
        state: candidates.length > 1 ? "ambiguous" : "unresolvable",
        reason:
          candidates.length > 1 ? "multiple_fresh_sockets" : diagnostic?.reason,
        decidingMac: latestObservation?.macAddress,
        observationUpdatedAt: latestObservation?.observedAt,
      };
    }
    const sameContinuousSocket =
      previous?.lastConfirmedSocketExternalId === selected.socketExternalId &&
      previous.consecutiveAbsences === 0;
    return {
      computer,
      present,
      candidates,
      selected,
      state: placedSocketDevices.has(selected.socketExternalId)
        ? "online"
        : "resolved_unplaced",
      presentOnSocketSinceAt: sameContinuousSocket
        ? previous.presentOnSocketSinceAt
        : args.occurredAt,
      decidingMac:
        (selected.computerMac && normalizeMacAddress(selected.computerMac)) ||
        latestObservation?.macAddress,
      observationUpdatedAt: selected.observedAt,
    };
  });

  const decisionsBySocket = new Map<string, Array<Decision>>();
  for (const decision of decisions) {
    if (!decision.selected) continue;
    const values =
      decisionsBySocket.get(decision.selected.socketExternalId) ?? [];
    values.push(decision);
    decisionsBySocket.set(decision.selected.socketExternalId, values);
  }
  for (const occupants of decisionsBySocket.values()) {
    if (occupants.length < 2) continue;
    const newest = Math.max(
      ...occupants.map(
        (item) => item.presentOnSocketSinceAt ?? args.occurredAt,
      ),
    );
    const winners = occupants.filter(
      (item) => (item.presentOnSocketSinceAt ?? args.occurredAt) === newest,
    );
    for (const occupant of occupants) {
      if (winners.length === 1 && winners[0] === occupant) continue;
      occupant.state = "socket_conflict";
      occupant.reason = socketConflictReason(
        occupant.presentOnSocketSinceAt ?? args.occurredAt,
        newest,
        winners.length,
      );
    }
  }

  for (const decision of decisions) {
    const previous =
      existingByComputer.get(decision.computer.externalId) ?? null;
    const selected =
      decision.state === "socket_conflict" ? undefined : decision.selected;
    const lastPresenceAt = decision.present
      ? args.occurredAt
      : previous?.lastPresenceAt;
    const socketDevice = selected
      ? placedSocketDevices.get(selected.socketExternalId)
      : undefined;
    const projection =
      selected && decision.state === "online" && socketDevice
        ? await publishProjectionTarget(ctx, {
            siteId: args.siteId,
            computerExternalId: decision.computer.externalId,
            cycleId: args.cycleId,
            socketExternalId: selected.socketExternalId,
            socketDevice,
            computer: {
              instanceKey: decision.computer.instanceKey,
              name: decision.computer.name,
              hostname: decision.computer.hostname,
              ip: decision.computer.ip,
              model: decision.computer.model,
              url: decision.computer.url,
              location: decision.computer.location,
              locationPath: decision.computer.locationPath,
              role: decision.computer.role,
              lifecycleStatus: decision.computer.lifecycleStatus,
              syncedAt: decision.computer.capturedAt,
            },
            occurredAt: args.occurredAt,
            canKeepSuccess:
              previous?.state === "online" &&
              previous.projectionStatus === "success" &&
              previous.consecutiveAbsences === 0 &&
              previous.expiredAt === undefined &&
              previous.lastConfirmedSocketExternalId ===
                selected.socketExternalId,
            canKeepBlocked:
              previous?.state === "online" &&
              previous.projectionStatus === "blocked" &&
              previous.lastConfirmedSocketExternalId ===
                selected.socketExternalId,
          })
        : null;
    if (!projection) {
      await invalidateProjectionTarget(
        ctx,
        args.siteId,
        decision.computer.externalId,
      );
    }
    const projectionStatus = projection?.status ?? ("idle" as const);
    const nextRow = {
      siteId: args.siteId,
      computerExternalId: decision.computer.externalId,
      state: decision.state,
      decidingMac: decision.decidingMac,
      socketExternalId: selected?.socketExternalId,
      switchExternalId: selected?.switchExternalId,
      switchPort: selected?.switchPort,
      reason: decision.reason,
      firstPresentCycleId: decision.present
        ? (previous?.firstPresentCycleId ?? args.cycleId)
        : previous?.firstPresentCycleId,
      lastPresentCycleId: decision.present
        ? args.cycleId
        : previous?.lastPresentCycleId,
      consecutiveAbsences: decision.present
        ? 0
        : (previous?.consecutiveAbsences ?? 0) + 1,
      lastConfirmedSocketExternalId:
        selected?.socketExternalId ?? previous?.lastConfirmedSocketExternalId,
      observationUpdatedAt: decision.observationUpdatedAt,
      lastKnownFloorId:
        projection?.published === false
          ? projection.targetFloorId
          : previous?.lastKnownFloorId,
      lastKnownPosition:
        projection?.published === false
          ? projection.targetPosition
          : previous?.lastKnownPosition,
      visualExpiresAt:
        lastPresenceAt !== undefined
          ? lastPresenceAt + VISUAL_RETENTION_MS
          : undefined,
      expiredAt: decision.present ? undefined : previous?.expiredAt,
      projectionStatus,
      projectionCycleId:
        projection?.status === "pending" || projection?.status === "blocked"
          ? projection.cycleId
          : undefined,
      lastProjectedCycleId: previous?.lastProjectedCycleId,
      projectionTargetFloorId: projection?.targetFloorId,
      projectionTargetPosition: projection?.targetPosition,
      projectionErrorCode: projection?.errorCode,
      projectionNextAttemptAt: projection?.nextAttemptAt,
      candidateSocketExternalIds: decision.candidates.map(
        (candidate) => candidate.socketExternalId,
      ),
      presentOnSocketSinceAt: decision.presentOnSocketSinceAt,
      lastPresenceAt,
      updatedAt: args.occurredAt,
    };
    const eventKinds = localizationEventKinds(previous, decision);
    if (previous) await ctx.db.patch(previous._id, nextRow);
    else await ctx.db.insert("computerLocations", nextRow);
    for (const kind of eventKinds) {
      await ctx.db.insert("localizationEvents", {
        siteId: args.siteId,
        computerExternalId: decision.computer.externalId,
        cycleId: args.cycleId,
        kind,
        occurredAt: args.occurredAt,
        fromSocketExternalId: previous?.lastConfirmedSocketExternalId,
        toSocketExternalId: selected?.socketExternalId,
        reason: decision.reason,
      });
    }
    if (
      previous?.state !== nextRow.state ||
      previous.projectionStatus !== nextRow.projectionStatus ||
      previous.projectionTargetFloorId !== nextRow.projectionTargetFloorId ||
      previous.projectionTargetPosition?.x !==
        nextRow.projectionTargetPosition?.x ||
      previous.projectionTargetPosition?.y !==
        nextRow.projectionTargetPosition?.y ||
      previous.expiredAt !== nextRow.expiredAt
    ) {
      await bumpComputerPresentationRevision(
        ctx,
        args.siteId,
        decision.computer.externalId,
        args.occurredAt,
      );
    }
  }

  return {
    resolvedCount: decisions.filter(
      (item) => item.state === "online" || item.state === "resolved_unplaced",
    ).length,
    ambiguousCount: decisions.filter((item) => item.state === "ambiguous")
      .length,
    unresolvableCount: decisions.filter(
      (item) =>
        item.state === "unresolvable" || item.state === "socket_conflict",
    ).length,
    missingCount: decisions.filter((item) => item.state === "missing").length,
    offlineCount: decisions.filter((item) => item.state === "offline").length,
  };
};
