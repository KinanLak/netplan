import { v } from "convex/values";
import { query } from "./_generated/server";
import { resolveLibreNmsTopology } from "./topology";
import type {
  LibreNmsDevice,
  LibreNmsFdbEntry,
  LibreNmsLldpLink,
  LibreNmsPort,
  PhysicalTopologyConnection,
  TopologyInventoryItem,
} from "./topology";

declare const process: { env: Record<string, string | undefined> };

const SITE = "Arles";
const PROVIDER = "librenms" as const;
const REQUEST_TIMEOUT_MS = 30_000;

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const recordsAt = (value: unknown, key: string): Array<JsonRecord> => {
  const record = asRecord(value);
  const rows = record?.[key];
  if (!Array.isArray(rows)) return [];
  const records: Array<JsonRecord> = [];
  for (const row of rows) {
    const item = asRecord(row);
    if (item) records.push(item);
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

const config = () => {
  const configuredUrl = process.env.LIBRENMS_URL?.trim();
  const apiToken = process.env.LIBRENMS_TOKEN?.trim();
  if (!configuredUrl) throw new Error("LIBRENMS_URL n'est pas configurée");
  if (!apiToken) throw new Error("LIBRENMS_TOKEN n'est pas configuré");
  const normalized = configuredUrl.replace(/\/$/, "");
  return {
    base: new URL(`${normalized}/`),
    apiToken,
  };
};

const requestJson = async (
  base: URL,
  apiToken: string,
  path: string,
): Promise<unknown> => {
  const url = new URL(path, base);
  if (url.origin !== base.origin) throw new Error("Endpoint LibreNMS invalide");
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "X-Auth-Token": apiToken,
      Accept: "application/json",
      "User-Agent": "Netplan-LibreNMS-Connector/1.0",
    },
  });
  if (!response.ok) {
    const detail = (await response.text())
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
    throw new Error(
      `LibreNMS a répondu ${response.status} sur ${url.pathname}${detail ? ` : ${detail}` : ""}`,
    );
  }
  return await response.json();
};

const parseDevices = (payload: unknown): Array<LibreNmsDevice> =>
  recordsAt(payload, "devices").flatMap((row) => {
    const deviceId = numberAt(row, "device_id");
    if (deviceId === undefined) return [];
    return [
      {
        deviceId,
        hostname: stringAt(row, "hostname"),
        sysName: stringAt(row, "sysName"),
      },
    ];
  });

const parsePorts = (payload: unknown): Array<LibreNmsPort> =>
  recordsAt(payload, "ports").flatMap((row) => {
    const portId = numberAt(row, "port_id");
    const ifName = stringAt(row, "ifName");
    return portId === undefined || !ifName ? [] : [{ portId, ifName }];
  });

const parseFdb = (payload: unknown): Array<LibreNmsFdbEntry> =>
  recordsAt(payload, "ports_fdb").flatMap((row) => {
    const deviceId = numberAt(row, "device_id");
    const portId = numberAt(row, "port_id");
    const macAddress = stringAt(row, "mac_address");
    return deviceId === undefined || portId === undefined || !macAddress
      ? []
      : [
          {
            deviceId,
            portId,
            macAddress,
            updatedAt: stringAt(row, "updated_at"),
          },
        ];
  });

const parseLldp = (payload: unknown): Array<LibreNmsLldpLink> =>
  recordsAt(payload, "links").flatMap((row) => {
    if (stringAt(row, "protocol") !== "lldp") return [];
    const localDeviceId = numberAt(row, "local_device_id");
    const localPortId = numberAt(row, "local_port_id");
    const remoteHostname = stringAt(row, "remote_hostname");
    return localDeviceId === undefined ||
      localPortId === undefined ||
      !remoteHostname
      ? []
      : [{ localDeviceId, localPortId, remoteHostname }];
  });

export const buildLibreNmsDiscoveries = async (input: {
  inventory: Array<TopologyInventoryItem>;
  physicalConnections: Array<PhysicalTopologyConnection>;
}) => {
  const { base, apiToken } = config();
  const [devicesPayload, portsPayload, fdbPayload, linksPayload] =
    await Promise.all([
      requestJson(base, apiToken, "devices"),
      requestJson(base, apiToken, "ports"),
      requestJson(base, apiToken, "resources/fdb"),
      requestJson(base, apiToken, "resources/links"),
    ]);
  return resolveLibreNmsTopology({
    ...input,
    syncedAt: Date.now(),
    devices: parseDevices(devicesPayload),
    ports: parsePorts(portsPayload),
    fdb: parseFdb(fdbPayload),
    lldp: parseLldp(linksPayload),
  });
};

export const getSyncState = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      provider: v.literal("librenms"),
      site: v.string(),
      status: v.union(
        v.literal("syncing"),
        v.literal("ready"),
        v.literal("error"),
      ),
      startedAt: v.number(),
      completedAt: v.optional(v.number()),
      error: v.optional(v.string()),
      connectionCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("integrationSyncs")
      .withIndex("by_provider_site", (q) =>
        q.eq("provider", PROVIDER).eq("site", SITE),
      )
      .unique();
    if (!row || row.provider !== PROVIDER) return null;
    return {
      provider: PROVIDER,
      site: row.site,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      error: row.error,
      connectionCount: row.connectionCount,
    };
  },
});

export const listDiscoveredConnections = query({
  args: {},
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
  handler: async (ctx) => {
    const [connections, inventory] = await Promise.all([
      ctx.db
        .query("discoveredConnections")
        .withIndex("by_provider_site", (q) =>
          q.eq("provider", PROVIDER).eq("site", SITE),
        )
        .collect(),
      ctx.db
        .query("externalInventory")
        .withIndex("by_provider_site", (q) =>
          q.eq("provider", "netbox").eq("site", SITE),
        )
        .collect(),
    ]);
    const nameById = new Map(
      inventory.map((item) => [item.externalId, item.name]),
    );
    return connections.flatMap((connection) => {
      const computerName = nameById.get(connection.computerExternalId);
      const socketName = nameById.get(connection.socketExternalId);
      if (!computerName || !socketName) return [];
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
          syncedAt: connection.syncedAt,
        },
      ];
    });
  },
});
