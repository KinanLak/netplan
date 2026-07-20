import { parseExplicitOffsetTimestamp } from "./librenmsFreshness";

export interface TopologyInventoryItem {
  externalId: string;
  type: "rack" | "switch" | "pc" | "wall-port";
  name: string;
  macs: Array<string>;
  cabledTerminationCount: number;
}

export type NetBoxTerminationKind =
  | "interface"
  | "front-port"
  | "rear-port"
  | "other";

export interface PhysicalTopologyConnection {
  externalId: string;
  fromExternalId: string;
  fromPort?: string;
  fromTerminationExternalId: string;
  fromTerminationKind: NetBoxTerminationKind;
  fromPeerTerminationExternalIds: Array<string>;
  toExternalId: string;
  toPort?: string;
  toTerminationExternalId: string;
  toTerminationKind: NetBoxTerminationKind;
  toPeerTerminationExternalIds: Array<string>;
}

export interface LibreNmsDevice {
  deviceId: number;
  hostname?: string;
  sysName?: string;
}

export interface LibreNmsPort {
  deviceId: number;
  portId: number;
  ifName: string;
}

export interface LibreNmsFdbEntry {
  deviceId: number;
  portId: number;
  macAddress: string;
  updatedAt?: string;
  authoritative?: boolean;
}

export interface LibreNmsLldpLink {
  localDeviceId: number;
  localPortId: number;
  remoteHostname: string;
}

export interface DiscoveredTopologyConnection {
  externalId: string;
  computerExternalId: string;
  socketExternalId: string;
  switchExternalId: string;
  switchPort: string;
  computerMac?: string;
  method: "fdb" | "lldp" | "fdb+lldp";
  confidence: "high" | "medium";
  observedAt: number;
  cablePathExternalIds: Array<string>;
}

export type UnresolvableTopologyReason =
  | "incomplete_patch_panel_path"
  | "socket_without_cable"
  | "unknown_switch_port_in_netbox"
  | "switch_absent_from_site_configuration"
  | "conflicting_mac_inventory";

export interface TopologyResolutionDiagnostic {
  externalId: string;
  reason: UnresolvableTopologyReason;
  authoritative: boolean;
  computerExternalId?: string;
  socketExternalId?: string;
  switchExternalId?: string;
  switchPort?: string;
  computerMac?: string;
  libreNmsDeviceId?: string;
  portId?: number;
  observedAt?: number;
}

export interface ConfiguredLibreNmsSwitch {
  externalId: string;
  networkName: string;
}

type EndpointResolution =
  | {
      endpoints: Array<{
        socketExternalId: string;
        switchExternalId: string;
        switchPort: string;
        cablePathExternalIds: Array<string>;
      }>;
    }
  | {
      reason:
        | "incomplete_patch_panel_path"
        | "unknown_switch_port_in_netbox"
        | "switch_absent_from_site_configuration";
    };

export const normalizeMacAddress = (value: string): string => {
  const normalized = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  return normalized.length === 12 ? normalized : "";
};

export const normalizePortName = (value: string): string => {
  let normalized = value.toLowerCase().replaceAll(" ", "");
  const replacements: Array<[string, string]> = [
    ["tengigabitethernet", "te"],
    ["fortygigabitethernet", "fo"],
    ["twentyfivegige", "twe"],
    ["gigabitethernet", "gi"],
    ["fastethernet", "fa"],
  ];
  for (const [longName, shortName] of replacements) {
    normalized = normalized.replaceAll(longName, shortName);
  }
  return normalized;
};

export const normalizeNetworkDeviceName = (value: string): string =>
  value
    .split(".")[0]
    .toLowerCase()
    .replace(/-[12]$/, "");

const hostnameKey = (value: string): string =>
  value.split(".")[0].toLowerCase();

interface ResolvedObservation {
  computerExternalId: string;
  socketExternalId: string;
  switchExternalId: string;
  switchPort: string;
  computerMac?: string;
  observedAt: number;
  cablePathExternalIds: Array<string>;
}

interface Termination {
  externalId: string;
  deviceExternalId: string;
  port?: string;
  kind: NetBoxTerminationKind;
  peerExternalIds: Array<string>;
}

const observationKey = (observation: ResolvedObservation): string =>
  `${observation.computerExternalId}\0${observation.socketExternalId}`;

export const resolveLibreNmsTopology = (input: {
  inventory: Array<TopologyInventoryItem>;
  physicalConnections: Array<PhysicalTopologyConnection>;
  ports: Array<LibreNmsPort>;
  fdb: Array<LibreNmsFdbEntry>;
  lldp: Array<LibreNmsLldpLink>;
  configuredSwitches: Array<ConfiguredLibreNmsSwitch>;
  syncedAt: number;
}): {
  discoveries: Array<DiscoveredTopologyConnection>;
  diagnostics: Array<TopologyResolutionDiagnostic>;
} => {
  const inventoryById = new Map(
    input.inventory.map((item) => [item.externalId, item]),
  );
  const computerIdsByMac = new Map<string, Set<string>>();
  const computerByHostname = new Map<string, string>();
  for (const item of input.inventory) {
    if (item.type !== "pc") continue;
    computerByHostname.set(hostnameKey(item.name), item.externalId);
    for (const mac of item.macs) {
      const normalized = normalizeMacAddress(mac);
      if (!normalized) continue;
      const owners = computerIdsByMac.get(normalized) ?? new Set<string>();
      owners.add(item.externalId);
      computerIdsByMac.set(normalized, owners);
    }
  }

  const terminations = new Map<string, Termination>();
  const graph = new Map<
    string,
    Array<{ externalId: string; cableExternalId?: string }>
  >();
  const connect = (left: string, right: string, cableExternalId?: string) => {
    const leftEdges = graph.get(left) ?? [];
    const rightEdges = graph.get(right) ?? [];
    leftEdges.push({ externalId: right, cableExternalId });
    rightEdges.push({ externalId: left, cableExternalId });
    graph.set(left, leftEdges);
    graph.set(right, rightEdges);
  };
  const recordTermination = (termination: Termination) => {
    const previous = terminations.get(termination.externalId);
    if (
      previous &&
      (previous.deviceExternalId !== termination.deviceExternalId ||
        previous.kind !== termination.kind)
    ) {
      throw new Error("NetBox termination identity is inconsistent");
    }
    terminations.set(termination.externalId, termination);
  };
  for (const connection of input.physicalConnections) {
    const from: Termination = {
      externalId: connection.fromTerminationExternalId,
      deviceExternalId: connection.fromExternalId,
      port: connection.fromPort,
      kind: connection.fromTerminationKind,
      peerExternalIds: connection.fromPeerTerminationExternalIds,
    };
    const to: Termination = {
      externalId: connection.toTerminationExternalId,
      deviceExternalId: connection.toExternalId,
      port: connection.toPort,
      kind: connection.toTerminationKind,
      peerExternalIds: connection.toPeerTerminationExternalIds,
    };
    recordTermination(from);
    recordTermination(to);
    connect(from.externalId, to.externalId, connection.externalId);
  }
  for (const termination of terminations.values()) {
    if (termination.peerExternalIds.length !== 1) continue;
    const peer = terminations.get(termination.peerExternalIds[0]);
    if (
      peer?.peerExternalIds.length === 1 &&
      peer.peerExternalIds[0] === termination.externalId
    ) {
      connect(termination.externalId, peer.externalId);
    }
  }

  const diagnostics: Array<TopologyResolutionDiagnostic> = [];
  for (const item of input.inventory) {
    if (item.type !== "wall-port" || item.cabledTerminationCount > 0) {
      continue;
    }
    diagnostics.push({
      externalId: `netbox:${item.externalId}:socket-without-cable`,
      reason: "socket_without_cable",
      authoritative: false,
      socketExternalId: item.externalId,
    });
  }

  const configuredSwitchByLibreNmsId = new Map(
    input.configuredSwitches.map((device) => [
      Number(device.externalId),
      device,
    ]),
  );
  const portById = new Map(
    input.ports.map((port) => [
      `${port.deviceId}\0${port.portId}`,
      normalizePortName(port.ifName),
    ]),
  );

  const resolveEndpoint = (
    deviceId: number,
    portId: number,
  ): EndpointResolution => {
    const configuredSwitch = configuredSwitchByLibreNmsId.get(deviceId);
    const port = portById.get(`${deviceId}\0${portId}`);
    if (!configuredSwitch) {
      return { reason: "switch_absent_from_site_configuration" as const };
    }
    if (!port) {
      return { reason: "unknown_switch_port_in_netbox" as const };
    }
    const switchName = normalizeNetworkDeviceName(configuredSwitch.networkName);
    const netboxSwitches = input.inventory.filter(
      (item) =>
        item.type === "switch" &&
        normalizeNetworkDeviceName(item.name) === switchName,
    );
    const starts = [...terminations.values()].filter(
      (termination) =>
        netboxSwitches.some(
          (networkSwitch) =>
            networkSwitch.externalId === termination.deviceExternalId,
        ) && normalizePortName(termination.port ?? "") === port,
    );
    if (starts.length === 0) {
      return { reason: "unknown_switch_port_in_netbox" as const };
    }
    const visited = new Set<string>();
    const pending = starts.map((termination) => ({
      externalId: termination.externalId,
      cablePathExternalIds: [] as Array<string>,
    }));
    const sockets = new Map<string, Array<string>>();
    let sawPatchPanel = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || visited.has(current.externalId)) continue;
      const { externalId, cablePathExternalIds } = current;
      visited.add(externalId);
      const termination = terminations.get(externalId);
      if (!termination) continue;
      if (
        termination.kind === "front-port" ||
        termination.kind === "rear-port"
      ) {
        sawPatchPanel = true;
      }
      const device = inventoryById.get(termination.deviceExternalId);
      if (device?.type === "wall-port") {
        sockets.set(device.externalId, cablePathExternalIds);
      }
      for (const next of graph.get(externalId) ?? []) {
        pending.push({
          externalId: next.externalId,
          cablePathExternalIds: next.cableExternalId
            ? [...cablePathExternalIds, next.cableExternalId]
            : cablePathExternalIds,
        });
      }
    }
    if (sockets.size === 0) {
      return {
        reason: sawPatchPanel
          ? ("incomplete_patch_panel_path" as const)
          : ("unknown_switch_port_in_netbox" as const),
      };
    }
    return {
      endpoints: [...sockets].map(
        ([socketExternalId, cablePathExternalIds]) => ({
          socketExternalId,
          switchExternalId: starts[0].deviceExternalId,
          switchPort: starts[0].port ?? port,
          cablePathExternalIds,
        }),
      ),
    };
  };

  const fdbByPair = new Map<string, Array<ResolvedObservation>>();
  input.fdb.forEach((entry, index) => {
    const normalizedMac = normalizeMacAddress(entry.macAddress);
    const owners = computerIdsByMac.get(normalizedMac);
    const observedAt = entry.updatedAt
      ? parseExplicitOffsetTimestamp(entry.updatedAt)
      : undefined;
    if (!owners || observedAt === undefined) return;
    const authoritative = entry.authoritative !== false;
    const diagnosticBase = {
      authoritative,
      computerMac: normalizedMac,
      libreNmsDeviceId: String(entry.deviceId),
      portId: entry.portId,
      observedAt,
    };
    if (owners.size > 1) {
      for (const computerExternalId of owners) {
        diagnostics.push({
          ...diagnosticBase,
          externalId: `librenms:diagnostic:${index}:${computerExternalId}`,
          reason: "conflicting_mac_inventory",
          computerExternalId,
        });
      }
      return;
    }
    const computerExternalId = [...owners][0];
    const resolution = resolveEndpoint(entry.deviceId, entry.portId);
    if ("reason" in resolution) {
      diagnostics.push({
        ...diagnosticBase,
        externalId: `librenms:diagnostic:${index}:${computerExternalId}`,
        reason: resolution.reason,
        computerExternalId,
        switchPort: portById.get(`${entry.deviceId}\0${entry.portId}`),
      });
      return;
    }
    if (!authoritative) return;
    for (const endpoint of resolution.endpoints) {
      const observation: ResolvedObservation = {
        computerExternalId,
        ...endpoint,
        computerMac: normalizedMac,
        observedAt,
      };
      const key = observationKey(observation);
      const values = fdbByPair.get(key) ?? [];
      values.push(observation);
      fdbByPair.set(key, values);
    }
  });

  const lldpByPair = new Map<string, ResolvedObservation>();
  for (const link of input.lldp) {
    const computerExternalId = computerByHostname.get(
      hostnameKey(link.remoteHostname),
    );
    const resolution = resolveEndpoint(link.localDeviceId, link.localPortId);
    if (!computerExternalId || "reason" in resolution) continue;
    for (const endpoint of resolution.endpoints) {
      const observation: ResolvedObservation = {
        computerExternalId,
        ...endpoint,
        observedAt: input.syncedAt,
      };
      lldpByPair.set(observationKey(observation), observation);
    }
  }

  const results: Array<DiscoveredTopologyConnection> = [];
  for (const [key, observations] of fdbByPair) {
    const observation = observations.reduce((latest, candidate) =>
      candidate.observedAt > latest.observedAt ? candidate : latest,
    );
    const confirmedByLldp = lldpByPair.has(key);
    results.push({
      ...observation,
      externalId: `librenms:${observation.computerExternalId}:${observation.socketExternalId}`,
      method: confirmedByLldp ? "fdb+lldp" : "fdb",
      confidence: "high",
    });
  }

  return {
    discoveries: results.sort((a, b) =>
      a.computerExternalId.localeCompare(b.computerExternalId, "en", {
        numeric: true,
      }),
    ),
    diagnostics,
  };
};
