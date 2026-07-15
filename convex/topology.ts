export interface TopologyInventoryItem {
  externalId: string;
  type: "rack" | "switch" | "pc" | "wall-port";
  name: string;
  macs: Array<string>;
}

export interface PhysicalTopologyConnection {
  fromExternalId: string;
  fromPort?: string;
  toExternalId: string;
  toPort?: string;
}

export interface LibreNmsDevice {
  deviceId: number;
  hostname?: string;
  sysName?: string;
}

export interface LibreNmsPort {
  portId: number;
  ifName: string;
}

export interface LibreNmsFdbEntry {
  deviceId: number;
  portId: number;
  macAddress: string;
  updatedAt?: string;
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
}

export const normalizeMacAddress = (value: string): string =>
  value.toUpperCase().replace(/[^0-9A-F]/g, "");

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
}

const observationKey = (observation: ResolvedObservation): string =>
  `${observation.computerExternalId}\0${observation.socketExternalId}`;

export const resolveLibreNmsTopology = (input: {
  inventory: Array<TopologyInventoryItem>;
  physicalConnections: Array<PhysicalTopologyConnection>;
  devices: Array<LibreNmsDevice>;
  ports: Array<LibreNmsPort>;
  fdb: Array<LibreNmsFdbEntry>;
  lldp: Array<LibreNmsLldpLink>;
  syncedAt: number;
}): Array<DiscoveredTopologyConnection> => {
  const inventoryById = new Map(
    input.inventory.map((item) => [item.externalId, item]),
  );
  const computerByMac = new Map<string, string>();
  const computerByHostname = new Map<string, string>();
  for (const item of input.inventory) {
    if (item.type !== "pc") continue;
    computerByHostname.set(hostnameKey(item.name), item.externalId);
    for (const mac of item.macs) {
      const normalized = normalizeMacAddress(mac);
      if (normalized) computerByMac.set(normalized, item.externalId);
    }
  }

  const socketBySwitchPort = new Map<
    string,
    { socketExternalId: string; switchExternalId: string; switchPort: string }
  >();
  for (const connection of input.physicalConnections) {
    const from = inventoryById.get(connection.fromExternalId);
    const to = inventoryById.get(connection.toExternalId);
    const switchEnd =
      from?.type === "switch"
        ? { item: from, port: connection.fromPort }
        : to?.type === "switch"
          ? { item: to, port: connection.toPort }
          : null;
    const socketEnd =
      from?.type === "wall-port" ? from : to?.type === "wall-port" ? to : null;
    if (!switchEnd?.port || !socketEnd) continue;
    const switchName = normalizeNetworkDeviceName(switchEnd.item.name);
    const switchPort = normalizePortName(switchEnd.port);
    socketBySwitchPort.set(`${switchName}\0${switchPort}`, {
      socketExternalId: socketEnd.externalId,
      switchExternalId: switchEnd.item.externalId,
      switchPort: switchEnd.port,
    });
  }

  const switchNameByLibreNmsId = new Map<number, string>();
  for (const device of input.devices) {
    for (const candidate of [device.sysName, device.hostname]) {
      if (!candidate) continue;
      const normalized = normalizeNetworkDeviceName(candidate);
      if (normalized.startsWith("sw-")) {
        switchNameByLibreNmsId.set(device.deviceId, normalized);
        break;
      }
    }
  }
  const portById = new Map(
    input.ports.map((port) => [port.portId, normalizePortName(port.ifName)]),
  );

  const resolveEndpoint = (deviceId: number, portId: number) => {
    const switchName = switchNameByLibreNmsId.get(deviceId);
    const port = portById.get(portId);
    return switchName && port
      ? socketBySwitchPort.get(`${switchName}\0${port}`)
      : undefined;
  };

  const fdbByPair = new Map<string, Array<ResolvedObservation>>();
  for (const entry of input.fdb) {
    const normalizedMac = normalizeMacAddress(entry.macAddress);
    const computerExternalId = computerByMac.get(normalizedMac);
    const endpoint = resolveEndpoint(entry.deviceId, entry.portId);
    if (!computerExternalId || !endpoint) continue;
    const observation: ResolvedObservation = {
      computerExternalId,
      ...endpoint,
      computerMac: normalizedMac,
      observedAt: entry.updatedAt
        ? Date.parse(entry.updatedAt) || input.syncedAt
        : input.syncedAt,
    };
    const key = observationKey(observation);
    const values = fdbByPair.get(key) ?? [];
    values.push(observation);
    fdbByPair.set(key, values);
  }

  const lldpByPair = new Map<string, ResolvedObservation>();
  for (const link of input.lldp) {
    const computerExternalId = computerByHostname.get(
      hostnameKey(link.remoteHostname),
    );
    const endpoint = resolveEndpoint(link.localDeviceId, link.localPortId);
    if (!computerExternalId || !endpoint) continue;
    const observation: ResolvedObservation = {
      computerExternalId,
      ...endpoint,
      observedAt: input.syncedAt,
    };
    lldpByPair.set(observationKey(observation), observation);
  }

  const socketsByComputer = new Map<string, Set<string>>();
  for (const observations of fdbByPair.values()) {
    const observation = observations[0];
    const sockets =
      socketsByComputer.get(observation.computerExternalId) ?? new Set();
    sockets.add(observation.socketExternalId);
    socketsByComputer.set(observation.computerExternalId, sockets);
  }

  const results: Array<DiscoveredTopologyConnection> = [];
  const usedPairs = new Set<string>();
  for (const [key, observations] of fdbByPair) {
    const observation = observations[0];
    if (
      (socketsByComputer.get(observation.computerExternalId)?.size ?? 0) !== 1
    )
      continue;
    const confirmedByLldp = lldpByPair.has(key);
    results.push({
      ...observation,
      externalId: `librenms:${observation.computerExternalId}:${observation.socketExternalId}`,
      method: confirmedByLldp ? "fdb+lldp" : "fdb",
      confidence: "high",
      observedAt: Math.max(...observations.map((item) => item.observedAt)),
    });
    usedPairs.add(key);
  }

  const lldpSocketsByComputer = new Map<string, Set<string>>();
  for (const observation of lldpByPair.values()) {
    const sockets =
      lldpSocketsByComputer.get(observation.computerExternalId) ?? new Set();
    sockets.add(observation.socketExternalId);
    lldpSocketsByComputer.set(observation.computerExternalId, sockets);
  }
  for (const [key, observation] of lldpByPair) {
    if (usedPairs.has(key)) continue;
    if (
      (lldpSocketsByComputer.get(observation.computerExternalId)?.size ?? 0) !==
      1
    ) {
      continue;
    }
    results.push({
      ...observation,
      externalId: `librenms:${observation.computerExternalId}:${observation.socketExternalId}`,
      method: "lldp",
      confidence: "medium",
    });
  }

  return results.sort((a, b) =>
    a.computerExternalId.localeCompare(b.computerExternalId, "en", {
      numeric: true,
    }),
  );
};
