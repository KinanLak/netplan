import { v } from "convex/values";
import { query } from "./_generated/server";
import { libreNmsApiBaseUrl } from "./librenmsUrl";
import {
  normalizedFdbIdentitySet,
  parseExplicitOffsetTimestamp,
  summarizeFdbFreshness,
} from "./librenmsFreshness";
import type { SwitchFreshnessBounds } from "./librenmsFreshness";
import { normalizeMacAddress, resolveLibreNmsTopology } from "./topology";
import type {
  LibreNmsDevice,
  LibreNmsFdbEntry,
  LibreNmsLldpLink,
  LibreNmsPort,
  PhysicalTopologyConnection,
  TopologyInventoryItem,
  ConfiguredLibreNmsSwitch,
} from "./topology";

declare const process: { env: Record<string, string | undefined> };

const PROVIDER = "librenms" as const;
const REQUEST_TIMEOUT_MS = 30_000;
const TRIGGER_TIMEOUT_MS = 10_000;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const recordsAt = (value: unknown, key: string): Array<JsonRecord> => {
  const record = asRecord(value);
  const rows = record?.[key];
  if (!Array.isArray(rows)) {
    throw new Error(`Collection LibreNMS ${key} absente ou invalide`);
  }
  const records: Array<JsonRecord> = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (!item) throw new Error(`Ligne LibreNMS ${key} invalide`);
    records.push(item);
  }
  return records;
};

const stringAt = (value: JsonRecord, key: string): string | undefined => {
  const result = value[key];
  return typeof result === "string" && result.length > 0 ? result : undefined;
};

const numberAt = (value: JsonRecord, key: string): number | undefined => {
  const result = value[key];
  if (typeof result === "number" && Number.isFinite(result)) return result;
  if (typeof result === "string" && result.trim()) {
    const parsed = Number(result);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export { libreNmsApiBaseUrl } from "./librenmsUrl";

const config = () => {
  const configuredUrl = process.env.LIBRENMS_URL?.trim();
  const apiToken = process.env.LIBRENMS_TOKEN?.trim();
  if (!configuredUrl) throw new Error("LIBRENMS_URL n'est pas configurée");
  if (!apiToken) throw new Error("LIBRENMS_TOKEN n'est pas configuré");
  return {
    base: libreNmsApiBaseUrl(configuredUrl),
    apiToken,
  };
};

export type LibreNmsErrorCode =
  | "unreachable"
  | "trigger_refused"
  | "trigger_uncertain"
  | "switch_missing"
  | "invalid_response";

export class LibreNmsClientError extends Error {
  constructor(
    readonly code: LibreNmsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LibreNmsClientError";
  }
}

export interface LibreNmsDeviceStatus {
  deviceId: number;
  hostname?: string;
  sysName?: string;
  lastDiscovered?: string;
  lastDiscoveredTimetaken?: number;
  serverObservedAt: number;
}

interface LibreNmsClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

export const createLibreNmsClient = ({
  baseUrl,
  token,
  fetchImpl = fetch,
}: LibreNmsClientOptions) => {
  const base = new URL(`${baseUrl.replace(/\/$/, "")}/`);
  const requestJsonWithMetadata = async (
    path: string,
    options: { trigger?: boolean } = {},
  ): Promise<{ payload: unknown; serverObservedAt: number }> => {
    const url = new URL(path, base);
    if (url.origin !== base.origin) {
      throw new LibreNmsClientError(
        "invalid_response",
        "Endpoint LibreNMS invalide",
      );
    }
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        cache: options.trigger ? "no-store" : "default",
        signal: AbortSignal.timeout(
          options.trigger ? TRIGGER_TIMEOUT_MS : REQUEST_TIMEOUT_MS,
        ),
        headers: {
          "X-Auth-Token": token,
          Accept: "application/json",
          "User-Agent": "Netplan-LibreNMS-Connector/1.0",
          ...(options.trigger ? { "Cache-Control": "no-store" } : {}),
        },
      });
    } catch (error) {
      throw new LibreNmsClientError(
        options.trigger ? "trigger_uncertain" : "unreachable",
        error instanceof Error ? error.message : "Requête LibreNMS impossible",
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new LibreNmsClientError(
        options.trigger ? "trigger_refused" : "invalid_response",
        "LibreNMS a refusé une redirection",
      );
    }
    if (!response.ok) {
      const detail = (await response.text())
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 180);
      throw new LibreNmsClientError(
        options.trigger ? "trigger_refused" : "unreachable",
        `LibreNMS a répondu ${response.status} sur ${url.pathname}${detail ? ` : ${detail}` : ""}`,
      );
    }
    try {
      const serverDate = response.headers.get("Date");
      const parsedServerDate = serverDate ? Date.parse(serverDate) : Number.NaN;
      return {
        payload: await response.json(),
        serverObservedAt: Number.isFinite(parsedServerDate)
          ? parsedServerDate
          : Date.now(),
      };
    } catch {
      throw new LibreNmsClientError(
        "invalid_response",
        "Réponse JSON LibreNMS invalide",
      );
    }
  };

  const requestJson = async (
    path: string,
    options: { trigger?: boolean } = {},
  ): Promise<unknown> => (await requestJsonWithMetadata(path, options)).payload;

  const getDevice = async (deviceId: string): Promise<LibreNmsDeviceStatus> => {
    const response = await requestJsonWithMetadata(
      `devices/${encodeURIComponent(deviceId)}`,
    );
    const rows = recordsAt(response.payload, "devices");
    const row = rows.find(
      (candidate) => String(numberAt(candidate, "device_id")) === deviceId,
    );
    if (!row) {
      throw new LibreNmsClientError(
        "switch_missing",
        `Le switch LibreNMS ${deviceId} est absent`,
      );
    }
    return {
      deviceId: Number(deviceId),
      hostname: stringAt(row, "hostname"),
      sysName: stringAt(row, "sysName"),
      lastDiscovered: stringAt(row, "last_discovered"),
      lastDiscoveredTimetaken: numberAt(row, "last_discovered_timetaken"),
      serverObservedAt: response.serverObservedAt,
    };
  };

  const getDeviceFdb = async (deviceId: string) => {
    const response = await requestJsonWithMetadata(
      `devices/${encodeURIComponent(deviceId)}/fdb`,
    );
    return {
      rows: parseTargetedDeviceFdb(response.payload, deviceId),
      serverObservedAt: response.serverObservedAt,
    };
  };

  const triggerDiscovery = async (
    deviceId: string,
    cycleId: string,
  ): Promise<void> => {
    const path = `devices/${encodeURIComponent(deviceId)}/discover?netplan_cycle=${encodeURIComponent(cycleId)}&nonce=${Date.now()}`;
    await requestJson(path, { trigger: true });
  };

  const captureSwitch = async (deviceId: string) => {
    const [devicesResponse, portsResponse, fdbResponse, linksResponse] =
      await Promise.all([
        requestJsonWithMetadata(`devices/${encodeURIComponent(deviceId)}`),
        requestJsonWithMetadata(
          `devices/${encodeURIComponent(deviceId)}/ports?columns=port_id,ifName,ifDescr`,
        ),
        requestJsonWithMetadata("resources/fdb"),
        requestJsonWithMetadata("resources/links"),
      ]);
    const numericId = Number(deviceId);
    const devices = parseDevices(devicesResponse.payload).filter(
      (device) => device.deviceId === numericId,
    );
    if (devices.length !== 1) {
      throw new LibreNmsClientError(
        "switch_missing",
        `Le switch LibreNMS ${deviceId} est absent`,
      );
    }
    const ports = parsePorts(portsResponse.payload, numericId);
    const fdb = parseFdb(fdbResponse.payload).filter(
      (entry) => entry.deviceId === numericId,
    );
    const lldp = parseLldp(linksResponse.payload).filter(
      (link) => link.localDeviceId === numericId,
    );
    return {
      devices,
      ports,
      fdb,
      lldp,
      fetchedAt: Date.now(),
      serverObservedAt: Math.max(
        devicesResponse.serverObservedAt,
        portsResponse.serverObservedAt,
        fdbResponse.serverObservedAt,
        linksResponse.serverObservedAt,
      ),
    };
  };

  return {
    requestJson,
    requestJsonWithMetadata,
    getDevice,
    getDeviceFdb,
    triggerDiscovery,
    captureSwitch,
  };
};

const environmentClient = (
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
) => {
  const { base, apiToken } = config();
  return createLibreNmsClient({
    baseUrl: base.href,
    token: apiToken,
    fetchImpl,
  });
};

export const parseDevices = (payload: unknown): Array<LibreNmsDevice> =>
  recordsAt(payload, "devices").flatMap((row) => {
    const deviceId = numberAt(row, "device_id");
    if (deviceId === undefined) throw new Error("Device LibreNMS mal formé");
    return [
      {
        deviceId,
        hostname: stringAt(row, "hostname"),
        sysName: stringAt(row, "sysName"),
      },
    ];
  });

export const parsePorts = (
  payload: unknown,
  fallbackDeviceId?: number,
): Array<LibreNmsPort> =>
  recordsAt(payload, "ports").flatMap((row) => {
    const deviceId = numberAt(row, "device_id") ?? fallbackDeviceId;
    const portId = numberAt(row, "port_id");
    const ifName = stringAt(row, "ifName") ?? stringAt(row, "ifDescr");
    if (deviceId === undefined || portId === undefined || !ifName) {
      throw new Error("Port LibreNMS mal formé");
    }
    return [{ deviceId, portId, ifName }];
  });

export const parseFdb = (payload: unknown): Array<LibreNmsFdbEntry> =>
  recordsAt(payload, "ports_fdb").flatMap((row) => {
    const deviceId = numberAt(row, "device_id");
    const portId = numberAt(row, "port_id");
    const macAddress = stringAt(row, "mac_address");
    if (
      deviceId === undefined ||
      portId === undefined ||
      !macAddress ||
      !normalizeMacAddress(macAddress)
    ) {
      throw new Error("Entrée FDB LibreNMS mal formée");
    }
    return [
      {
        deviceId,
        portId,
        macAddress,
        updatedAt: stringAt(row, "updated_at"),
      },
    ];
  });

export const parseTargetedDeviceFdb = (
  payload: unknown,
  expectedDeviceId: string,
): Array<LibreNmsFdbEntry & { updatedAt: string }> => {
  const response = asRecord(payload);
  if (response?.status !== "ok") {
    throw new Error("Confirmation FDB LibreNMS sans statut ok");
  }
  const rows = parseFdb(payload);
  if (Object.hasOwn(response, "count")) {
    const count = numberAt(response, "count");
    if (!Number.isSafeInteger(count) || count !== rows.length) {
      throw new Error("Confirmation FDB LibreNMS partielle");
    }
  }
  const numericDeviceId = Number(expectedDeviceId);
  for (const row of rows) {
    if (
      row.deviceId !== numericDeviceId ||
      !row.updatedAt ||
      parseExplicitOffsetTimestamp(row.updatedAt) === undefined
    ) {
      throw new Error("Confirmation FDB LibreNMS mal formée");
    }
  }
  return rows as Array<LibreNmsFdbEntry & { updatedAt: string }>;
};

export const parseLldp = (payload: unknown): Array<LibreNmsLldpLink> =>
  recordsAt(payload, "links").flatMap((row) => {
    if (stringAt(row, "protocol") !== "lldp") return [];
    const localDeviceId = numberAt(row, "local_device_id");
    const localPortId = numberAt(row, "local_port_id");
    const remoteHostname = stringAt(row, "remote_hostname");
    if (
      localDeviceId === undefined ||
      localPortId === undefined ||
      !remoteHostname
    ) {
      throw new Error("Lien LLDP LibreNMS mal formé");
    }
    return [{ localDeviceId, localPortId, remoteHostname }];
  });

export const buildLibreNmsDiscoveries = async (input: {
  inventory: Array<TopologyInventoryItem>;
  physicalConnections: Array<PhysicalTopologyConnection>;
  configuredSwitches: Array<ConfiguredLibreNmsSwitch>;
  targetDeviceIds: Array<string>;
  freshnessBounds: Array<SwitchFreshnessBounds>;
  previousFreshFdbCounts: Array<{
    externalId: string;
    freshFdbCount: number;
  }>;
}) => {
  const client = environmentClient();
  const [devicesResponse, portResponses, fdbResponse, linksResponse] =
    await Promise.all([
      client.requestJsonWithMetadata("devices"),
      Promise.all(
        input.targetDeviceIds.map((externalId) =>
          client.requestJsonWithMetadata(
            `devices/${encodeURIComponent(externalId)}/ports?columns=port_id,ifName,ifDescr`,
          ),
        ),
      ),
      client.requestJsonWithMetadata("resources/fdb"),
      client.requestJsonWithMetadata("resources/links"),
    ]);
  const targetIds = new Set(input.targetDeviceIds.map(Number));
  const devices = parseDevices(devicesResponse.payload);
  const ports = portResponses.flatMap((response, index) =>
    parsePorts(response.payload, Number(input.targetDeviceIds[index])),
  );
  const fdb = parseFdb(fdbResponse.payload);
  const lldp = parseLldp(linksResponse.payload);
  const targetDevices = devices.filter((device) =>
    targetIds.has(device.deviceId),
  );
  const targetFdb = fdb.filter((entry) => targetIds.has(entry.deviceId));
  const targetLldp = lldp.filter((link) => targetIds.has(link.localDeviceId));
  const targetPorts = ports.filter((port) => targetIds.has(port.deviceId));
  const portNameById = new Map(
    targetPorts.map((port) => [
      `${port.deviceId}\0${port.portId}`,
      port.ifName,
    ]),
  );
  for (const externalId of input.targetDeviceIds) {
    const numericId = Number(externalId);
    if (!targetDevices.some((device) => device.deviceId === numericId)) {
      throw new Error(`Le switch LibreNMS ${externalId} est absent`);
    }
    if (!targetPorts.some((port) => port.deviceId === numericId)) {
      throw new Error(
        `Les ports du switch LibreNMS ${externalId} sont absents`,
      );
    }
  }
  for (const entry of targetFdb) {
    if (!portNameById.has(`${entry.deviceId}\0${entry.portId}`)) {
      throw new Error(
        `La FDB LibreNMS référence un port inconnu sur le switch ${entry.deviceId}`,
      );
    }
  }
  const effectiveBounds = input.freshnessBounds.map((bounds) => ({
    ...bounds,
    serverObservedAt: fdbResponse.serverObservedAt,
  }));
  if (
    input.targetDeviceIds.some(
      (externalId) =>
        !effectiveBounds.some((bounds) => bounds.externalId === externalId),
    )
  ) {
    throw new Error("Les bornes de fraîcheur LibreNMS sont incomplètes");
  }
  const freshness = summarizeFdbFreshness(targetFdb, effectiveBounds);
  const confirmationTargets = input.targetDeviceIds.filter((externalId) => {
    const previous = input.previousFreshFdbCounts.find(
      (item) => item.externalId === externalId,
    )?.freshFdbCount;
    if (!previous) return false;
    const current = freshness.fresh.filter(
      (entry) => String(entry.deviceId) === externalId,
    ).length;
    return current === 0 || current / previous <= 0.2;
  });
  const confirmations = new Map<
    string,
    {
      serverObservedAt: number;
      rows: Array<{
        deviceId: string;
        portId: number;
        macAddress: string;
        updatedAt: string;
      }>;
    }
  >();
  if (confirmationTargets.length > 0) {
    const confirmationResponses = await Promise.all(
      confirmationTargets.map(async (externalId) => ({
        externalId,
        response: await client.getDeviceFdb(externalId),
      })),
    );
    for (const { externalId, response } of confirmationResponses) {
      for (const entry of response.rows) {
        if (!portNameById.has(`${entry.deviceId}\0${entry.portId}`)) {
          throw new Error("La confirmation FDB référence un port inconnu");
        }
      }
      const bounds = effectiveBounds.find(
        (item) => item.externalId === externalId,
      );
      if (!bounds) throw new Error("Bornes LibreNMS absentes");
      const confirmedFresh = summarizeFdbFreshness(response.rows, [
        { ...bounds, serverObservedAt: response.serverObservedAt },
      ]).fresh;
      const firstFresh = freshness.fresh.filter(
        (entry) => String(entry.deviceId) === externalId,
      );
      const firstSet = normalizedFdbIdentitySet(
        firstFresh.flatMap((entry) =>
          entry.updatedAt ? [{ ...entry, updatedAt: entry.updatedAt }] : [],
        ),
      );
      const confirmedSet = normalizedFdbIdentitySet(confirmedFresh);
      if (
        !firstSet ||
        !confirmedSet ||
        JSON.stringify(firstSet) !== JSON.stringify(confirmedSet)
      ) {
        throw new Error(`La confirmation FDB du switch ${externalId} diverge`);
      }
      confirmations.set(externalId, {
        serverObservedAt: response.serverObservedAt,
        rows: response.rows.map((entry) => ({
          deviceId: String(entry.deviceId),
          portId: entry.portId,
          macAddress: entry.macAddress,
          updatedAt: entry.updatedAt,
        })),
      });
    }
  }
  const fetchedAt = Date.now();
  const resolution = resolveLibreNmsTopology({
    ...input,
    syncedAt: fetchedAt,
    ports: targetPorts,
    fdb: freshness.fresh.map((entry) => ({
      ...entry,
      authoritative: true,
    })),
    lldp: targetLldp,
  });
  const observations = [
    ...targetFdb.map((entry, index) => ({
      externalId: `fdb:${entry.deviceId}:${entry.portId}:${index}`,
      kind: "fdb" as const,
      libreNmsDeviceId: String(entry.deviceId),
      portId: entry.portId,
      portName: portNameById.get(`${entry.deviceId}\0${entry.portId}`),
      macAddress: entry.macAddress,
      sourceObservedAt: entry.updatedAt,
      fetchedAt,
    })),
    ...targetLldp.map((link, index) => ({
      externalId: `lldp:${link.localDeviceId}:${link.localPortId}:${index}`,
      kind: "lldp" as const,
      libreNmsDeviceId: String(link.localDeviceId),
      portId: link.localPortId,
      portName: portNameById.get(`${link.localDeviceId}\0${link.localPortId}`),
      remoteHostname: link.remoteHostname,
      fetchedAt,
    })),
  ];
  const switchResults = input.targetDeviceIds.map((externalId) => {
    const numericId = Number(externalId);
    const bounds = effectiveBounds.find(
      (item) => item.externalId === externalId,
    );
    if (!bounds) throw new Error("Bornes LibreNMS absentes");
    const rawFdb = targetFdb.filter((entry) => entry.deviceId === numericId);
    const freshFdb = freshness.fresh.filter(
      (entry) => entry.deviceId === numericId,
    );
    return {
      externalId,
      status: "success" as const,
      observationCount: observations.filter(
        (observation) => observation.libreNmsDeviceId === externalId,
      ).length,
      rawFdbCount: rawFdb.length,
      freshFdbCount: freshFdb.length,
      staleFdbCount: rawFdb.length - freshFdb.length,
      fdbConfirmation: confirmations.get(externalId),
      triggerStartedAt: bounds.triggerStartedAt,
      discoveryCompletedAt: bounds.discoveryCompletedAt,
      serverObservedAt: bounds.serverObservedAt,
    };
  });
  return {
    discoveries: resolution.discoveries,
    diagnostics: resolution.diagnostics,
    observations,
    switchResults,
  };
};

export const libreNmsClientFromEnvironment = environmentClient;

export const getSyncState = query({
  args: { siteId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      provider: v.literal("librenms"),
      siteId: v.string(),
      status: v.union(
        v.literal("idle"),
        v.literal("running"),
        v.literal("success"),
        v.literal("error"),
        v.literal("backoff"),
        v.literal("blocked"),
        v.literal("disabled"),
      ),
      lastAttemptAt: v.optional(v.number()),
      lastSuccessAt: v.optional(v.number()),
      error: v.optional(v.string()),
      connectionCount: v.number(),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", "localization"),
      )
      .unique();
    if (!state) return null;
    return {
      provider: PROVIDER,
      siteId,
      status: state.status,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      error: state.publicError,
      connectionCount: state.lastSecondaryCount ?? 0,
    };
  },
});

export const listDiscoveredConnections = query({
  args: { siteId: v.string() },
  returns: v.array(
    v.object({
      externalId: v.string(),
      computerExternalId: v.string(),
      computerName: v.string(),
      socketExternalId: v.string(),
      socketName: v.string(),
      switchExternalId: v.string(),
      switchPort: v.string(),
      method: v.union(
        v.literal("fdb"),
        v.literal("lldp"),
        v.literal("fdb+lldp"),
      ),
      confidence: v.union(v.literal("high"), v.literal("medium")),
      observedAt: v.number(),
      syncedAt: v.number(),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", "localization"),
      )
      .unique();
    if (!state?.lastPublishedId) return [];
    const snapshot = await ctx.db
      .query("localizationSnapshots")
      .withIndex("by_site_snapshot", (q) =>
        q
          .eq("siteId", siteId)
          .eq("snapshotId", state.lastPublishedId as string),
      )
      .unique();
    if (!snapshot) return [];
    const [connections, inventory, locations] = await Promise.all([
      ctx.db
        .query("localizationLinks")
        .withIndex("by_snapshot", (q) =>
          q.eq("siteId", siteId).eq("snapshotId", snapshot.snapshotId),
        )
        .collect(),
      ctx.db
        .query("netboxInventory")
        .withIndex("by_generation", (q) =>
          q
            .eq("siteId", siteId)
            .eq("generationId", snapshot.netboxGenerationId),
        )
        .collect(),
      ctx.db
        .query("computerLocations")
        .withIndex("by_site_computer", (q) => q.eq("siteId", siteId))
        .collect(),
    ]);
    const nameById = new Map(
      inventory.map((item) => [item.externalId, item.name]),
    );
    const locationByComputer = new Map(
      locations.map((location) => [location.computerExternalId, location]),
    );
    return connections.flatMap((connection) => {
      const computerName = nameById.get(connection.computerExternalId);
      const socketName = nameById.get(connection.socketExternalId);
      const location = locationByComputer.get(connection.computerExternalId);
      if (
        !computerName ||
        !socketName ||
        !location ||
        (location.state !== "online" &&
          location.state !== "resolved_unplaced") ||
        location.socketExternalId !== connection.socketExternalId
      ) {
        return [];
      }
      return [
        {
          externalId: connection.externalId,
          computerExternalId: connection.computerExternalId,
          computerName,
          socketExternalId: connection.socketExternalId,
          socketName,
          switchExternalId: connection.switchExternalId,
          switchPort: connection.switchPort,
          method: connection.method,
          confidence: connection.confidence,
          observedAt: connection.observedAt,
          syncedAt: connection.capturedAt,
        },
      ];
    });
  },
});
