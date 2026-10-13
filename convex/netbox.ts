import { v } from "convex/values";
import type { Infer } from "convex/values";
import { query } from "./_generated/server";
import type { connectionInput } from "./netboxModel";
import { inventoryInput } from "./netboxModel";

declare const process: {
  env: Record<string, string | undefined>;
};

const PROVIDER = "netbox" as const;
const PAGE_SIZE = "500";
const REQUEST_TIMEOUT_MS = 30_000;

type JsonRecord = Record<string, unknown>;
type InventoryInput = Infer<typeof inventoryInput>;
type ConnectionInput = Infer<typeof connectionInput>;

const { macs: _privateMacs, ...publicInventoryFields } = inventoryInput.fields;
const inventoryItem = v.object({
  ...publicInventoryFields,
  siteId: v.string(),
  instanceKey: v.string(),
  syncedAt: v.number(),
  placement: v.optional(
    v.object({ deviceId: v.string(), floorId: v.string() }),
  ),
});

const syncState = v.object({
  provider: v.literal("netbox"),
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

const requestJson = async (
  url: URL,
  apiToken: string,
  parentSignal?: AbortSignal,
): Promise<unknown> => {
  const response = await fetch(url, {
    method: "GET",
    signal: parentSignal
      ? AbortSignal.any([parentSignal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
  parentSignal?: AbortSignal,
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
    const payload = asRecord(await requestJson(next, apiToken, parentSignal));
    if (!payload) throw new Error("Réponse NetBox invalide");
    if (!Array.isArray(payload.results)) {
      throw new Error("Collection NetBox absente ou incomplète");
    }
    for (const row of asArray(payload.results)) {
      const record = asRecord(row);
      if (!record) throw new Error("Ligne NetBox invalide");
      rows.push(record);
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
  deviceExternalId: string;
  terminationExternalId: string;
  kind: ConnectionInput["fromTerminationKind"];
  port?: string;
  peerTerminationExternalIds: Array<string>;
}

const terminationKind = (
  objectType: string,
): ConnectionInput["fromTerminationKind"] => {
  if (objectType === "dcim.interface") return "interface";
  if (objectType === "dcim.frontport") return "front-port";
  if (objectType === "dcim.rearport") return "rear-port";
  return "other";
};

const termination = (
  value: unknown,
  peerIdsByTermination: ReadonlyMap<string, Array<string>>,
): Termination | null => {
  const item = asRecord(asArray(value)[0]);
  const object = recordAt(item, "object");
  const objectType = stringAt(item, "object_type");
  const objectId = numberAt(object, "id");
  if (!objectType || objectId === undefined) return null;
  const terminationExternalId = `${objectType}:${objectId}`;
  const device = recordAt(object, "device");
  const deviceId = numberAt(device, "id");
  return {
    deviceExternalId:
      deviceId === undefined ? terminationExternalId : `device:${deviceId}`,
    terminationExternalId,
    kind: terminationKind(objectType),
    port: stringAt(object, "name") ?? stringAt(object, "display"),
    peerTerminationExternalIds:
      peerIdsByTermination.get(terminationExternalId) ?? [],
  };
};

export const parsePhysicalConnections = (
  cables: Array<JsonRecord>,
  frontPorts: Array<JsonRecord>,
): Array<ConnectionInput> => {
  const frontIdsByRearId = new Map<string, Array<string>>();
  const rearIdByFrontId = new Map<string, string>();
  for (const frontPort of frontPorts) {
    const frontId = numberAt(frontPort, "id");
    const rearId = numberAt(recordAt(frontPort, "rear_port"), "id");
    if (frontId === undefined || rearId === undefined) continue;
    const frontExternalId = `dcim.frontport:${frontId}`;
    const rearExternalId = `dcim.rearport:${rearId}`;
    rearIdByFrontId.set(frontExternalId, rearExternalId);
    const frontIds = frontIdsByRearId.get(rearExternalId) ?? [];
    frontIds.push(frontExternalId);
    frontIdsByRearId.set(rearExternalId, frontIds);
  }
  const peerIdsByTermination = new Map<string, Array<string>>();
  for (const [frontId, rearId] of rearIdByFrontId) {
    peerIdsByTermination.set(frontId, [rearId]);
  }
  for (const [rearId, frontIds] of frontIdsByRearId) {
    peerIdsByTermination.set(rearId, frontIds);
  }

  const connections: Array<ConnectionInput> = [];
  for (const cable of cables) {
    const id = numberAt(cable, "id");
    const from = termination(cable.a_terminations, peerIdsByTermination);
    const to = termination(cable.b_terminations, peerIdsByTermination);
    if (id === undefined || !from || !to) continue;
    connections.push({
      externalId: `cable:${id}`,
      fromExternalId: from.deviceExternalId,
      fromPort: from.port,
      fromTerminationExternalId: from.terminationExternalId,
      fromTerminationKind: from.kind,
      fromPeerTerminationExternalIds: from.peerTerminationExternalIds,
      toExternalId: to.deviceExternalId,
      toPort: to.port,
      toTerminationExternalId: to.terminationExternalId,
      toTerminationKind: to.kind,
      toPeerTerminationExternalIds: to.peerTerminationExternalIds,
    });
  }
  return connections;
};

export const buildNetBoxSnapshot = async (
  config: {
    externalSiteId: string;
    externalSiteSlug: string;
  },
  parentSignal?: AbortSignal,
) => {
  const base = apiBaseUrl();
  const apiToken = token();
  const [statusPayload, sites] = await Promise.all([
    requestJson(new URL("status/", base), apiToken, parentSignal),
    fetchAll(base, apiToken, "dcim/sites/", {}, parentSignal),
  ]);
  const site = sites.find(
    (candidate) =>
      String(numberAt(candidate, "id")) === config.externalSiteId &&
      stringAt(candidate, "slug") === config.externalSiteSlug,
  );
  const siteId = numberAt(site, "id");
  if (siteId === undefined) {
    throw new Error("Le site NetBox configuré est introuvable");
  }

  const [locationsRaw, racks, devices, interfaces, cables, frontPorts] =
    await Promise.all([
      fetchAll(
        base,
        apiToken,
        "dcim/locations/",
        { site_id: String(siteId) },
        parentSignal,
      ),
      fetchAll(
        base,
        apiToken,
        "dcim/racks/",
        { site_id: String(siteId) },
        parentSignal,
      ),
      fetchAll(
        base,
        apiToken,
        "dcim/devices/",
        {
          site_id: String(siteId),
          exclude: "config_context",
        },
        parentSignal,
      ),
      fetchAll(
        base,
        apiToken,
        "dcim/interfaces/",
        { site_id: String(siteId) },
        parentSignal,
      ),
      fetchAll(
        base,
        apiToken,
        "dcim/cables/",
        { site_id: String(siteId) },
        parentSignal,
      ),
      fetchAll(
        base,
        apiToken,
        "dcim/front-ports/",
        { site_id: String(siteId) },
        parentSignal,
      ),
    ]);

  const locations = new Map<number, LocationInfo>();
  for (const row of locationsRaw) {
    const id = numberAt(row, "id");
    const name = stringAt(row, "name");
    if (id === undefined || !name) {
      throw new Error("Emplacement NetBox mal formé");
    }
    locations.set(id, {
      id,
      name,
      parentId: numberAt(recordAt(row, "parent"), "id"),
    });
  }

  const siteDeviceIds = new Set(
    devices.flatMap((device) => {
      const id = numberAt(device, "id");
      return id === undefined ? [] : [id];
    }),
  );
  const macsByDevice = new Map<number, Array<string>>();
  const interfaceCountByDevice = new Map<number, number>();
  const cabledTerminationCountByDevice = new Map<number, number>();
  for (const row of interfaces) {
    const deviceId = numberAt(recordAt(row, "device"), "id");
    if (deviceId === undefined) {
      throw new Error("Interface NetBox sans device");
    }
    if (!siteDeviceIds.has(deviceId)) continue;
    interfaceCountByDevice.set(
      deviceId,
      (interfaceCountByDevice.get(deviceId) ?? 0) + 1,
    );
    if (recordAt(row, "cable")) {
      cabledTerminationCountByDevice.set(
        deviceId,
        (cabledTerminationCountByDevice.get(deviceId) ?? 0) + 1,
      );
    }
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
    if (id === undefined || !name) {
      throw new Error("Device NetBox mal formé");
    }
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
      location: path.at(-1),
      locationPath: path,
      ip: stripPrefix(stringAt(primaryIp, "address")),
      macs: macsByDevice.get(id) ?? [],
      interfaceCount: interfaceCountByDevice.get(id) ?? 0,
      cabledTerminationCount: cabledTerminationCountByDevice.get(id) ?? 0,
      lifecycleStatus: choiceValue(device, "status"),
      url: stringAt(device, "display_url") ?? stringAt(device, "url") ?? "",
      sourceUpdatedAt: stringAt(device, "last_updated"),
    });
  }

  for (const rack of racks) {
    const id = numberAt(rack, "id");
    const name = stringAt(rack, "name");
    if (id === undefined || !name) throw new Error("Rack NetBox mal formé");
    const locationId = numberAt(recordAt(rack, "location"), "id");
    const path = locationPath(locationId, locations);
    inventory.push({
      externalId: `rack:${id}`,
      type: "rack",
      name,
      role: "Rack",
      location: path.at(-1),
      locationPath: path,
      macs: [],
      interfaceCount: 0,
      cabledTerminationCount: 0,
      lifecycleStatus: choiceValue(rack, "status"),
      url: stringAt(rack, "display_url") ?? stringAt(rack, "url") ?? "",
      sourceUpdatedAt: stringAt(rack, "last_updated"),
    });
  }

  const connections = parsePhysicalConnections(cables, frontPorts);

  const status = asRecord(statusPayload);
  return {
    inventory,
    connections,
    sourceVersion: stringAt(status, "netbox-version"),
  };
};

export const getSyncState = query({
  args: { siteId: v.string() },
  returns: v.union(v.null(), syncState),
  handler: async (ctx, { siteId }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", "netbox"),
      )
      .unique();
    if (!state) return null;
    const generation = state.lastPublishedId
      ? await ctx.db
          .query("netboxGenerations")
          .withIndex("by_site_generation", (q) =>
            q
              .eq("siteId", siteId)
              .eq("generationId", state.lastPublishedId as string),
          )
          .unique()
      : null;
    return {
      provider: PROVIDER,
      siteId,
      status: state.status,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      error: state.publicError,
      inventoryCount: state.lastPrimaryCount ?? 0,
      connectionCount: state.lastSecondaryCount ?? 0,
      sourceVersion: generation?.sourceVersion,
    };
  },
});

export const listInventory = query({
  args: { siteId: v.string() },
  returns: v.array(inventoryItem),
  handler: async (ctx, { siteId }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", "netbox"),
      )
      .unique();
    if (!state?.lastPublishedId) return [];
    const generation = await ctx.db
      .query("netboxGenerations")
      .withIndex("by_site_generation", (q) =>
        q
          .eq("siteId", siteId)
          .eq("generationId", state.lastPublishedId as string),
      )
      .unique();
    if (!generation) return [];
    const [inventory, bindings] = await Promise.all([
      ctx.db
        .query("netboxInventory")
        .withIndex("by_generation", (q) =>
          q.eq("siteId", siteId).eq("generationId", generation.generationId),
        )
        .collect(),
      ctx.db
        .query("externalObjectBindings")
        .withIndex("by_external", (q) =>
          q
            .eq("siteId", siteId)
            .eq("provider", PROVIDER)
            .eq("instanceKey", generation.instanceKey),
        )
        .collect(),
    ]);
    const placementByExternalId = new Map(
      bindings.map((binding) => [
        binding.externalId,
        { deviceId: binding.deviceId, floorId: binding.floorId },
      ]),
    );
    return inventory
      .map(
        ({
          _id,
          _creationTime,
          provider,
          generationId,
          capturedAt,
          macs: _macs,
          ...item
        }) => ({
          ...item,
          cabledTerminationCount: item.cabledTerminationCount ?? 0,
          syncedAt: capturedAt,
          placement: placementByExternalId.get(item.externalId),
        }),
      )
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
  args: { siteId: v.string(), externalId: v.string() },
  returns: v.array(
    v.object({
      externalId: v.string(),
      fromExternalId: v.string(),
      fromPort: v.optional(v.string()),
      fromTerminationExternalId: v.string(),
      fromTerminationKind: v.union(
        v.literal("interface"),
        v.literal("front-port"),
        v.literal("rear-port"),
        v.literal("other"),
      ),
      fromPeerTerminationExternalIds: v.array(v.string()),
      toExternalId: v.string(),
      toPort: v.optional(v.string()),
      toTerminationExternalId: v.string(),
      toTerminationKind: v.union(
        v.literal("interface"),
        v.literal("front-port"),
        v.literal("rear-port"),
        v.literal("other"),
      ),
      toPeerTerminationExternalIds: v.array(v.string()),
      capturedAt: v.number(),
    }),
  ),
  handler: async (ctx, { siteId, externalId }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", "netbox"),
      )
      .unique();
    if (!state?.lastPublishedId) return [];
    const generationId = state.lastPublishedId;
    const [from, to] = await Promise.all([
      ctx.db
        .query("netboxConnections")
        .withIndex("by_generation_from", (q) =>
          q
            .eq("siteId", siteId)
            .eq("generationId", generationId)
            .eq("fromExternalId", externalId),
        )
        .collect(),
      ctx.db
        .query("netboxConnections")
        .withIndex("by_generation_to", (q) =>
          q
            .eq("siteId", siteId)
            .eq("generationId", generationId)
            .eq("toExternalId", externalId),
        )
        .collect(),
    ]);
    return [...from, ...to].map(
      ({
        _id,
        _creationTime,
        provider,
        siteId: _siteId,
        generationId: _generationId,
        instanceKey,
        kind,
        ...connection
      }) => ({
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
      }),
    );
  },
});
