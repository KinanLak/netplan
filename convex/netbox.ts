import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { connectionInput } from "./netboxModel";
import { inventoryInput } from "./netboxModel";

declare const process: {
  env: Record<string, string | undefined>;
};

const SITE = "Arles";
const PROVIDER = "netbox" as const;
const PAGE_SIZE = "500";

type JsonRecord = Record<string, unknown>;
type InventoryInput = Infer<typeof inventoryInput>;
type ConnectionInput = Infer<typeof connectionInput>;

const inventoryItem = v.object({
  ...inventoryInput.fields,
  syncedAt: v.number(),
  placement: v.optional(
    v.object({ deviceId: v.string(), floorId: v.string() }),
  ),
});

const syncState = v.object({
  provider: v.literal("netbox"),
  site: v.string(),
  status: v.union(v.literal("syncing"), v.literal("ready"), v.literal("error")),
  startedAt: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  inventoryCount: v.number(),
  connectionCount: v.number(),
  sourceVersion: v.optional(v.string()),
});

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const asArray = (value: unknown): Array<unknown> =>
  Array.isArray(value) ? value : [];

const stringAt = (value: unknown, key: string): string | undefined => {
  const record = asRecord(value);
  const result = record?.[key];
  return typeof result === "string" && result.length > 0 ? result : undefined;
};

const numberAt = (value: unknown, key: string): number | undefined => {
  const record = asRecord(value);
  const result = record?.[key];
  return typeof result === "number" && Number.isFinite(result)
    ? result
    : undefined;
};

const recordAt = (value: unknown, key: string): JsonRecord | null => {
  const record = asRecord(value);
  return asRecord(record?.[key]);
};

const relatedName = (value: unknown, key: string): string | undefined => {
  const related = recordAt(value, key);
  return (
    stringAt(related, "name") ??
    stringAt(related, "display") ??
    stringAt(related, "label")
  );
};

const choiceValue = (value: unknown, key: string): string => {
  const choice = recordAt(value, key);
  return stringAt(choice, "value") ?? "unknown";
};

const apiBaseUrl = (): URL => {
  const configured = process.env.NETBOX_URL?.trim();
  if (!configured) throw new Error("NETBOX_URL n'est pas configurée");
  const withoutApi = configured.replace(/\/?api\/?$/, "").replace(/\/$/, "");
  return new URL(`${withoutApi}/api/`);
};

const token = (): string => {
  const value = process.env.NETBOX_TOKEN?.trim();
  if (!value) throw new Error("NETBOX_TOKEN n'est pas configuré");
  return value;
};

const requestJson = async (url: URL, apiToken: string): Promise<unknown> => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Token ${apiToken}`,
      Accept: "application/json",
      "User-Agent": "Netplan-NetBox-Connector/1.0",
    },
  });
  if (!response.ok) {
    const detail = (await response.text())
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
    throw new Error(
      `NetBox a répondu ${response.status} sur ${url.pathname}${detail ? ` : ${detail}` : ""}`,
    );
  }
  return await response.json();
};

const fetchAll = async (
  base: URL,
  apiToken: string,
  path: string,
  params: Record<string, string> = {},
): Promise<Array<JsonRecord>> => {
  const first = new URL(path, base);
  first.searchParams.set("limit", PAGE_SIZE);
  for (const [key, value] of Object.entries(params)) {
    first.searchParams.set(key, value);
  }

  const rows: Array<JsonRecord> = [];
  let next: URL | null = first;
  while (next) {
    if (next.origin !== base.origin) {
      throw new Error("NetBox a renvoyé une pagination vers un autre hôte");
    }
    const payload = asRecord(await requestJson(next, apiToken));
    if (!payload) throw new Error("Réponse NetBox invalide");
    for (const row of asArray(payload.results)) {
      const record = asRecord(row);
      if (record) rows.push(record);
    }
    const nextUrl = typeof payload.next === "string" ? payload.next : null;
    next = nextUrl ? new URL(nextUrl, base) : null;
  }
  return rows;
};

const mappedDeviceType = (
  role: string,
  name: string,
): InventoryInput["type"] | null => {
  const normalizedRole = role.trim().toLowerCase();
  if (normalizedRole === "wall socket") return "wall-port";
  if (normalizedRole === "switch access" || normalizedRole === "switch core")
    return "switch";
  if (
    ["workstation", "laptop", "windows", "render", "remote"].includes(
      normalizedRole,
    ) ||
    /^(ordi|render|tnzpv)[-.\d]/i.test(name)
  ) {
    return "pc";
  }
  return null;
};

interface LocationInfo {
  id: number;
  name: string;
  parentId?: number;
}

const locationPath = (
  id: number | undefined,
  locations: ReadonlyMap<number, LocationInfo>,
): Array<string> => {
  const path: Array<string> = [];
  const visited = new Set<number>();
  let cursor = id;
  while (cursor !== undefined && !visited.has(cursor)) {
    visited.add(cursor);
    const location = locations.get(cursor);
    if (!location) break;
    path.unshift(location.name);
    cursor = location.parentId;
  }
  return path;
};

const stripPrefix = (address: string | undefined): string | undefined =>
  address?.split("/")[0];

interface Termination {
  externalId: string;
  port?: string;
}

const termination = (value: unknown): Termination | null => {
  const item = asRecord(asArray(value)[0]);
  const object = recordAt(item, "object");
  const device = recordAt(object, "device");
  const deviceId = numberAt(device, "id");
  if (deviceId === undefined) return null;
  return {
    externalId: `device:${deviceId}`,
    port: stringAt(object, "name") ?? stringAt(object, "display"),
  };
};

export const buildNetBoxSnapshot = async () => {
  const base = apiBaseUrl();
  const apiToken = token();
  const [statusPayload, sites] = await Promise.all([
    requestJson(new URL("status/", base), apiToken),
    fetchAll(base, apiToken, "dcim/sites/"),
  ]);
  const site = sites.find((candidate) => stringAt(candidate, "name") === SITE);
  const siteId = numberAt(site, "id");
  if (siteId === undefined) throw new Error(`Le site ${SITE} est introuvable`);

  const [locationsRaw, racks, devices, interfaces, cables] = await Promise.all([
    fetchAll(base, apiToken, "dcim/locations/", {
      site_id: String(siteId),
    }),
    fetchAll(base, apiToken, "dcim/racks/", { site_id: String(siteId) }),
    fetchAll(base, apiToken, "dcim/devices/", {
      site_id: String(siteId),
      exclude: "config_context",
    }),
    fetchAll(base, apiToken, "dcim/interfaces/"),
    fetchAll(base, apiToken, "dcim/cables/"),
  ]);

  const locations = new Map<number, LocationInfo>();
  for (const row of locationsRaw) {
    const id = numberAt(row, "id");
    const name = stringAt(row, "name");
    if (id === undefined || !name) continue;
    locations.set(id, {
      id,
      name,
      parentId: numberAt(recordAt(row, "parent"), "id"),
    });
  }

  const arlesDeviceIds = new Set(
    devices.flatMap((device) => {
      const id = numberAt(device, "id");
      return id === undefined ? [] : [id];
    }),
  );
  const macsByDevice = new Map<number, Array<string>>();
  const interfaceCountByDevice = new Map<number, number>();
  for (const row of interfaces) {
    const deviceId = numberAt(recordAt(row, "device"), "id");
    if (deviceId === undefined || !arlesDeviceIds.has(deviceId)) continue;
    interfaceCountByDevice.set(
      deviceId,
      (interfaceCountByDevice.get(deviceId) ?? 0) + 1,
    );
    const mac = stringAt(row, "mac_address");
    if (!mac) continue;
    const values = macsByDevice.get(deviceId) ?? [];
    if (!values.includes(mac)) values.push(mac);
    macsByDevice.set(deviceId, values);
  }

  const inventory: Array<InventoryInput> = [];
  for (const device of devices) {
    const id = numberAt(device, "id");
    const name = stringAt(device, "name") ?? stringAt(device, "display");
    if (id === undefined || !name) continue;
    const role = relatedName(device, "role") ?? "Sans rôle";
    const type = mappedDeviceType(role, name);
    if (!type) continue;
    const locationId = numberAt(recordAt(device, "location"), "id");
    const path = locationPath(locationId, locations);
    const primaryIp =
      recordAt(device, "primary_ip4") ?? recordAt(device, "primary_ip");
    inventory.push({
      externalId: `device:${id}`,
      type,
      name,
      hostname: name,
      model: relatedName(device, "device_type"),
      role,
      site: SITE,
      location: path.at(-1),
      locationPath: path,
      ip: stripPrefix(stringAt(primaryIp, "address")),
      macs: macsByDevice.get(id) ?? [],
      interfaceCount: interfaceCountByDevice.get(id) ?? 0,
      lifecycleStatus: choiceValue(device, "status"),
      url: stringAt(device, "display_url") ?? stringAt(device, "url") ?? "",
      sourceUpdatedAt: stringAt(device, "last_updated"),
    });
  }

  for (const rack of racks) {
    const id = numberAt(rack, "id");
    const name = stringAt(rack, "name");
    if (id === undefined || !name) continue;
    const locationId = numberAt(recordAt(rack, "location"), "id");
    const path = locationPath(locationId, locations);
    inventory.push({
      externalId: `rack:${id}`,
      type: "rack",
      name,
      role: "Rack",
      site: SITE,
      location: path.at(-1),
      locationPath: path,
      macs: [],
      interfaceCount: 0,
      lifecycleStatus: choiceValue(rack, "status"),
      url: stringAt(rack, "display_url") ?? stringAt(rack, "url") ?? "",
      sourceUpdatedAt: stringAt(rack, "last_updated"),
    });
  }

  const inventoryIds = new Set(inventory.map((item) => item.externalId));
  const connections: Array<ConnectionInput> = [];
  for (const cable of cables) {
    const id = numberAt(cable, "id");
    const from = termination(cable.a_terminations);
    const to = termination(cable.b_terminations);
    if (
      id === undefined ||
      !from ||
      !to ||
      !inventoryIds.has(from.externalId) ||
      !inventoryIds.has(to.externalId)
    ) {
      continue;
    }
    connections.push({
      externalId: `cable:${id}`,
      fromExternalId: from.externalId,
      fromPort: from.port,
      toExternalId: to.externalId,
      toPort: to.port,
    });
  }

  const status = asRecord(statusPayload);
  return {
    inventory,
    connections,
    sourceVersion: stringAt(status, "netbox-version"),
  };
};

export const getSyncState = query({
  args: {},
  returns: v.union(v.null(), syncState),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("integrationSyncs")
      .withIndex("by_provider_site", (q) =>
        q.eq("provider", PROVIDER).eq("site", SITE),
      )
      .unique();
    if (!row) return null;
    if (row.provider !== PROVIDER) return null;
    return {
      provider: PROVIDER,
      site: row.site,
      status: row.status,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      error: row.error,
      inventoryCount: row.inventoryCount,
      connectionCount: row.connectionCount,
      sourceVersion: row.sourceVersion,
    };
  },
});

export const listInventory = query({
  args: {},
  returns: v.array(inventoryItem),
  handler: async (ctx) => {
    const [inventory, placedDevices] = await Promise.all([
      ctx.db
        .query("externalInventory")
        .withIndex("by_provider_site", (q) =>
          q.eq("provider", PROVIDER).eq("site", SITE),
        )
        .collect(),
      ctx.db.query("devices").collect(),
    ]);
    const placementByExternalId = new Map(
      placedDevices.flatMap((device) => {
        const source = device.metadata.source;
        return source?.provider === PROVIDER
          ? [
              [
                source.externalId,
                { deviceId: device.objectId, floorId: device.floorId },
              ] as const,
            ]
          : [];
      }),
    );
    return inventory
      .map(({ _id, _creationTime, provider, ...item }) => ({
        ...item,
        placement: placementByExternalId.get(item.externalId),
      }))
      .sort((a, b) =>
        `${a.locationPath.join("/")}\0${a.name}`.localeCompare(
          `${b.locationPath.join("/")}\0${b.name}`,
          "fr",
          { numeric: true },
        ),
      );
  },
});

export const listConnections = query({
  args: { externalId: v.string() },
  returns: v.array(
    v.object({
      externalId: v.string(),
      fromExternalId: v.string(),
      fromPort: v.optional(v.string()),
      toExternalId: v.string(),
      toPort: v.optional(v.string()),
      syncedAt: v.number(),
    }),
  ),
  handler: async (ctx, { externalId }) => {
    const [from, to] = await Promise.all([
      ctx.db
        .query("externalConnections")
        .withIndex("by_from", (q) =>
          q.eq("provider", PROVIDER).eq("fromExternalId", externalId),
        )
        .collect(),
      ctx.db
        .query("externalConnections")
        .withIndex("by_to", (q) =>
          q.eq("provider", PROVIDER).eq("toExternalId", externalId),
        )
        .collect(),
    ]);
    return [...from, ...to].map(
      ({ _id, _creationTime, provider, site, kind, ...connection }) =>
        connection,
    );
  },
});

export const syncArles = action({
  args: {},
  returns: v.object({
    inventoryCount: v.number(),
    connectionCount: v.number(),
  }),
  handler: async (
    ctx,
  ): Promise<{ inventoryCount: number; connectionCount: number }> => {
    const startedAt = Date.now();
    await ctx.runMutation(internal.netboxModel.markSyncing, {
      site: SITE,
      startedAt,
    });
    try {
      const snapshot = await buildNetBoxSnapshot();
      return await ctx.runMutation(internal.netboxModel.replaceSnapshot, {
        site: SITE,
        startedAt,
        completedAt: Date.now(),
        ...snapshot,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erreur inconnue";
      await ctx.runMutation(internal.netboxModel.markFailed, {
        site: SITE,
        startedAt,
        completedAt: Date.now(),
        error: message,
      });
      throw new ConvexError(message);
    }
  },
});
