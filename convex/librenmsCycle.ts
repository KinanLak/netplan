// The LibreNMS step of a collection cycle (ADRs 0022 and 0023): the polled
// switches rediscover, their ports and forwarding tables are read, and each
// MAC address seen on an edge port is recorded where it was seen. A `pc` or
// `endpoint` comes online when one of its MACs is seen, and goes offline
// once none has been for two cycles.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { cycleOf } from "./lib/cycles";
import { pause, SOURCE_RETRY } from "./lib/httpRetry";
import { PROBE_RETRY, sourceGet } from "./lib/integrationProbe";
import { cableRowAt, portRowsOf, traceRows } from "./lib/ports";
import { EMPTY_LIBRENMS_SETTINGS, polledSwitches } from "../src/sites/librenms";
import {
  edgeSightings,
  isOnline,
  matchPorts,
  MISSES_OFFLINE,
  readLastDiscovered,
  readLibreNMSFdb,
  readLibreNMSPorts,
  sightingSummary,
} from "../src/sites/librenmsCycle";
import type { FdbEntry, SwitchPort } from "../src/sites/librenmsCycle";

const DISCOVERY_EVERY_MS = 5 * 60_000;
const DISCOVERY_WAIT_MS = 2 * 60_000;
const DISCOVERY_POLL_MS = 10_000;

const SIGHTED_BY = "librenms";

const PRESENT_TYPES: ReadonlySet<Doc<"devices">["type"]> = new Set([
  "pc",
  "endpoint",
]);

const sighting = v.object({
  mac: v.string(),
  portId: v.string(),
  switchId: v.string(),
  socketId: v.optional(v.string()),
});

const deviceOf = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
    .unique();

const ownerOf = async (ctx: QueryCtx, siteId: string, mac: string) => {
  const row = await ctx.db
    .query("deviceMacs")
    .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
    .unique();
  return row ? await deviceOf(ctx, row.deviceId) : null;
};

const sightingRowsOf = async (ctx: QueryCtx, siteId: string) =>
  await ctx.db
    .query("macSightings")
    .withIndex("by_site_mac", (q) => q.eq("siteId", siteId))
    .collect();

/**
 * The LibreNMS devices the cycle reads, each with the switches it stands
 * for, and whether it is time to ask them to rediscover.
 */
export const cyclePlan = internalQuery({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      baseUrl: v.string(),
      discover: v.boolean(),
      devices: v.array(
        v.object({
          id: v.number(),
          name: v.string(),
          switchIds: v.array(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, { siteId, cycleId }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== cycleId) return null;
    const row = await ctx.db
      .query("integrations")
      .withIndex("by_site_kind", (q) =>
        q.eq("siteId", siteId).eq("kind", "librenms"),
      )
      .unique();
    if (!row) return null;
    const switches = new Set(
      (
        await ctx.db
          .query("devices")
          .withIndex("by_site", (q) => q.eq("siteId", siteId))
          .collect()
      )
        .filter((device) => device.type === "switch")
        .map((device) => device.objectId),
    );
    const devices = new Map<
      number,
      { id: number; name: string; switchIds: Array<string> }
    >();
    for (const { switchId, device } of polledSwitches(
      row.librenms ?? EMPTY_LIBRENMS_SETTINGS,
    )) {
      if (!switches.has(switchId)) continue;
      const entry = devices.get(device.id) ?? { ...device, switchIds: [] };
      entry.switchIds.push(switchId);
      devices.set(device.id, entry);
    }
    return {
      baseUrl: row.baseUrl,
      discover:
        Date.now() - (cycle.librenmsDiscoveryAt ?? 0) >= DISCOVERY_EVERY_MS,
      devices: [...devices.values()],
    };
  },
});

/** Notes that the cycle asks for a discovery; `false` once it lost its lease. */
export const markDiscovery = internalMutation({
  args: { siteId: v.string(), cycleId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { siteId, cycleId }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== cycleId) return false;
    await ctx.db.patch(cycle._id, { librenmsDiscoveryAt: Date.now() });
    return true;
  },
});

/** The ports of the switches a LibreNMS device stands for, and their cabling. */
export const switchPorts = internalQuery({
  args: { switchIds: v.array(v.string()) },
  returns: v.array(
    v.object({
      id: v.string(),
      switchId: v.string(),
      name: v.string(),
      socketId: v.union(v.null(), v.string()),
      cabled: v.boolean(),
    }),
  ),
  handler: async (ctx, { switchIds }) => {
    const ports: Array<SwitchPort> = [];
    for (const switchId of switchIds) {
      for (const port of await portRowsOf(ctx, switchId)) {
        const cabled = (await cableRowAt(ctx, port.objectId)) !== null;
        const end = cabled ? (await traceRows(ctx, port)).at(-1) : undefined;
        const socket = end ? await deviceOf(ctx, end.deviceId) : null;
        ports.push({
          id: port.objectId,
          switchId,
          name: port.name,
          socketId: socket?.type === "wall-port" ? socket.objectId : null,
          cabled,
        });
      }
    }
    return ports;
  },
});

const setStatus = async (
  ctx: MutationCtx,
  device: Doc<"devices">,
  status: "up" | "down" | undefined,
) => {
  const { status: _previous, ...metadata } = device.metadata;
  await ctx.db.patch(device._id, {
    metadata: status === undefined ? metadata : { ...metadata, status },
    updatedAt: Date.now(),
    updatedBy: SIGHTED_BY,
  });
};

/**
 * Records a cycle's sightings. A MAC not seen counts a miss when its switch
 * was read, so a LibreNMS that fails does not take devices offline; a MAC no
 * device carries is forgotten once it is offline.
 */
export const recordSightings = internalMutation({
  args: {
    siteId: v.string(),
    cycleId: v.string(),
    failedSwitchIds: v.array(v.string()),
    sightings: v.array(sighting),
  },
  returns: v.union(
    v.null(),
    v.object({
      seen: v.number(),
      online: v.number(),
      offline: v.number(),
      unknown: v.number(),
    }),
  ),
  handler: async (ctx, { siteId, cycleId, failedSwitchIds, sightings }) => {
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== cycleId) return null;
    const now = Date.now();
    const rows = await sightingRowsOf(ctx, siteId);
    const rowOf = new Map(rows.map((row) => [row.mac, row]));
    const misses = new Map(rows.map((row) => [row.mac, row.misses]));
    const changed = new Set<string>();

    for (const { mac, portId, switchId, socketId } of sightings) {
      const fields = { switchId, portId, socketId, seenAt: now, misses: 0 };
      const row = rowOf.get(mac);
      if (row) await ctx.db.patch(row._id, fields);
      else await ctx.db.insert("macSightings", { siteId, mac, ...fields });
      misses.set(mac, 0);
      changed.add(mac);
    }
    const seen = new Set(sightings.map(({ mac }) => mac));
    const failed = new Set(failedSwitchIds);
    for (const row of rows) {
      // Past the offline mark a further miss changes nothing.
      if (seen.has(row.mac) || failed.has(row.switchId)) continue;
      if (row.misses >= MISSES_OFFLINE) continue;
      misses.set(row.mac, row.misses + 1);
      changed.add(row.mac);
    }

    const owners = new Map<string, Doc<"devices">>();
    let unknown = 0;
    for (const mac of changed) {
      const owner = await ownerOf(ctx, siteId, mac);
      if (owner) owners.set(owner.objectId, owner);
      else if (seen.has(mac)) unknown += 1;
      const row = rowOf.get(mac);
      if (!row || seen.has(mac)) continue;
      const missed = misses.get(mac) ?? 0;
      if (!owner && missed >= MISSES_OFFLINE) await ctx.db.delete(row._id);
      else await ctx.db.patch(row._id, { misses: missed });
    }

    let online = 0;
    let offline = 0;
    for (const device of owners.values()) {
      if (!PRESENT_TYPES.has(device.type)) continue;
      const status = isOnline(
        device.macs.flatMap((mac) => misses.get(mac) ?? []),
      )
        ? "up"
        : "down";
      if (device.metadata.status === status) continue;
      await setStatus(ctx, device, status);
      if (status === "up") online += 1;
      else offline += 1;
    }
    return { seen: seen.size, online, offline, unknown };
  },
});

/**
 * Forgets where the network saw the site's MAC addresses, and the online
 * status it gave their devices: without LibreNMS nothing would update them.
 */
export const releaseLibreNMS = async (ctx: MutationCtx, siteId: string) => {
  for (const row of await sightingRowsOf(ctx, siteId)) {
    const owner = await ownerOf(ctx, siteId, row.mac);
    if (owner && PRESENT_TYPES.has(owner.type) && owner.metadata.status) {
      await setStatus(ctx, owner, undefined);
    }
    await ctx.db.delete(row._id);
  }
};

/** Deletes a site's sightings along with the site. */
export const deleteSightings = async (ctx: MutationCtx, siteId: string) => {
  for (const row of await sightingRowsOf(ctx, siteId)) {
    await ctx.db.delete(row._id);
  }
};

type LibreNMSRead = (path: string) => ReturnType<typeof sourceGet>;

/**
 * Asks each device to rediscover and waits, up to two minutes, until
 * LibreNMS records a new discovery for each. LibreNMS clears a device's
 * `last_discovered` when asked and sets it once done. Returns the names of
 * the devices that did not finish in time.
 */
const rediscover = async (
  readOnce: LibreNMSRead,
  devices: ReadonlyArray<{ id: number; name: string }>,
): Promise<Array<string>> => {
  const before = new Map<number, string | null>();
  for (const device of devices) {
    const current = await readOnce(`/api/v0/devices/${device.id}`);
    if (!current.ok) continue;
    const asked = await readOnce(`/api/v0/devices/${device.id}/discover`);
    if (asked.ok) before.set(device.id, readLastDiscovered(current.body));
  }
  const deadline = Date.now() + DISCOVERY_WAIT_MS;
  for (;;) {
    for (const [id, last] of before) {
      const answer = await readOnce(`/api/v0/devices/${id}`);
      const now = answer.ok ? readLastDiscovered(answer.body) : null;
      if (now !== null && now !== last) before.delete(id);
    }
    if (before.size === 0 || Date.now() + DISCOVERY_POLL_MS > deadline) break;
    await pause(DISCOVERY_POLL_MS);
  }
  return devices
    .filter((device) => before.has(device.id))
    .map((device) => device.name);
};

/** Reads the polled switches from LibreNMS and records what they saw. */
export const collectFromLibreNMS = async (
  ctx: ActionCtx,
  siteId: string,
  cycleId: string,
  connection: { baseUrl: string; token: string },
): Promise<{ ok: boolean; message: string }> => {
  const plan = await ctx.runQuery(internal.librenmsCycle.cyclePlan, {
    siteId,
    cycleId,
  });
  // The address changed since the connection was opened.
  if (!plan || plan.baseUrl !== connection.baseUrl) {
    return { ok: true, message: "" };
  }
  const { baseUrl, token } = connection;
  const read: LibreNMSRead = async (path) =>
    await sourceGet("librenms", baseUrl, path, token, SOURCE_RETRY);
  const readOnce: LibreNMSRead = async (path) =>
    await sourceGet("librenms", baseUrl, path, token, PROBE_RETRY);

  const notes: Array<string> = [];
  if (
    plan.discover &&
    plan.devices.length > 0 &&
    (await ctx.runMutation(internal.librenmsCycle.markDiscovery, {
      siteId,
      cycleId,
    }))
  ) {
    for (const name of await rediscover(readOnce, plan.devices)) {
      notes.push(`« ${name} » n'a pas fini sa découverte à temps.`);
    }
  }

  const failedSwitchIds: Array<string> = [];
  const fdb: Array<FdbEntry> = [];
  const matched = new Map<number, string>();
  const ports: Array<SwitchPort> = [];
  let readCount = 0;
  for (const device of plan.devices) {
    const [portList, fdbList] = await Promise.all([
      read(`/api/v0/devices/${device.id}/ports?columns=port_id,ifName,ifDescr`),
      read(`/api/v0/devices/${device.id}/fdb`),
    ]);
    if (!portList.ok || !fdbList.ok) {
      failedSwitchIds.push(...device.switchIds);
      const reason = portList.ok ? fdbList : portList;
      if (!reason.ok) notes.push(`« ${device.name} » : ${reason.message}`);
      continue;
    }
    const own = await ctx.runQuery(internal.librenmsCycle.switchPorts, {
      switchIds: device.switchIds,
    });
    // LibreNMS numbers ports across all its devices, so the maps merge.
    for (const [portId, ownId] of matchPorts(
      readLibreNMSPorts(portList.body),
      own,
    )) {
      matched.set(portId, ownId);
    }
    fdb.push(...readLibreNMSFdb(fdbList.body));
    ports.push(...own);
    readCount += 1;
  }

  const counts = await ctx.runMutation(internal.librenmsCycle.recordSightings, {
    siteId,
    cycleId,
    failedSwitchIds,
    sightings: edgeSightings(fdb, matched, ports),
  });
  if (!counts) return { ok: true, message: "" };
  if (plan.devices.length === 0) {
    return { ok: true, message: "Aucun switch n'est interrogé." };
  }
  return {
    ok: failedSwitchIds.length === 0,
    message: [
      sightingSummary({ switches: readCount, ...counts }),
      ...notes,
    ].join(" "),
  };
};
