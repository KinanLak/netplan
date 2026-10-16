// The LibreNMS step of a collection cycle (ADRs 0022 and 0023): the polled
// switches rediscover, their ports and forwarding tables are read, and each
// MAC address seen on an edge port is recorded where it was seen. A `pc` or
// `endpoint` comes online when one of its MACs is seen, and goes offline
// once none has been for two cycles; one seen at a new socket, or while on no
// floor, is placed next to it.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { cycleOf } from "./lib/cycles";
import { ignoredMacsOf } from "./lib/ignoredMacs";
import { PRESENT_TYPES, staleAfterOf, statusFrom } from "./lib/statuses";
import { toPublicDevice } from "./mapDocument";
import { applyMapOperation, getWallCollisionRect } from "./mapOperations";
import type { OperationInput } from "./mapOperations";
import { pause, SOURCE_RETRY } from "./lib/httpRetry";
import { PROBE_RETRY, sourceGet } from "./lib/integrationProbe";
import { cableRowAt, portRowsOf, traceRows } from "./lib/ports";
import { fdbTable } from "./siteValidators";
import { DEFAULT_DEVICE_SIZES } from "../src/devices/deviceSizes";
import { EMPTY_LIBRENMS_SETTINGS, polledSwitches } from "../src/sites/librenms";
import { spotNextToSocket } from "../src/sites/socketPlacement";
import {
  edgeSightings,
  freshFdb,
  freshSwitches,
  matchPorts,
  MISSES_OFFLINE,
  readLastDiscovered,
  readLibreNMSDeviceStatus,
  readLibreNMSFdb,
  readLibreNMSPorts,
  sightingSummary,
  socketMoves,
} from "../src/sites/librenmsCycle";
import type {
  FdbEntry,
  FdbTable,
  SwitchPort,
  SwitchRead,
} from "../src/sites/librenmsCycle";
import type { FloorId } from "../src/types/map";

const DISCOVERY_EVERY_MS = 5 * 60_000;
const DISCOVERY_WAIT_MS = 2 * 60_000;
const DISCOVERY_POLL_MS = 10_000;

const SIGHTED_BY = "librenms";

/** One of the map's operations, before the cycle names it. */
type AtomicMapOperationInput =
  Exclude<OperationInput, { kind: "batch" }> extends infer Operation
    ? Operation extends unknown
      ? Omit<Operation, "meta">
      : never
    : never;

const sighting = v.object({
  mac: v.string(),
  portId: v.string(),
  switchId: v.string(),
  socketId: v.optional(v.string()),
});

export const deviceOf = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
    .unique();

export const ownerOf = async (ctx: QueryCtx, siteId: string, mac: string) => {
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
          fdbTable: v.optional(fdbTable),
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
    const tables = new Map(
      (cycle.librenmsTables ?? []).map(({ deviceId, table }) => [
        deviceId,
        table,
      ]),
    );
    const devices = new Map<
      number,
      {
        id: number;
        name: string;
        switchIds: Array<string>;
        fdbTable?: FdbTable;
      }
    >();
    for (const { switchId, device } of polledSwitches(
      row.librenms ?? EMPTY_LIBRENMS_SETTINGS,
    )) {
      if (!switches.has(switchId)) continue;
      const entry = devices.get(device.id) ?? {
        ...device,
        switchIds: [],
        ...(tables.has(device.id) && { fdbTable: tables.get(device.id) }),
      };
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
  if (device.metadata.status === status) return;
  const { status: _previous, ...metadata } = device.metadata;
  await ctx.db.patch(device._id, {
    metadata: status === undefined ? metadata : { ...metadata, status },
    updatedAt: Date.now(),
    updatedBy: SIGHTED_BY,
  });
};

/**
 * Removes what rests on a switch read that has grown too old (ADR 0025): the
 * switch's status, and the status of devices last seen on it unless another
 * switch still vouches for them. Run every minute, so it holds when LibreNMS
 * fails, the switch is no longer polled, or cycles stop.
 */
export const expireStaleReads = async (
  ctx: MutationCtx,
  site: Doc<"sites">,
  cycle: Doc<"siteCycles">,
  now: number,
) => {
  const reads = cycle.switchReads ?? [];
  const staleAfter = staleAfterOf(site);
  const stale = new Set(
    reads
      .filter((read) => !read.expired && now - read.readAt > staleAfter)
      .map((read) => read.switchId),
  );
  if (stale.size === 0) return;
  const next = reads.map((read): SwitchRead =>
    stale.has(read.switchId) ? { ...read, expired: true } : read,
  );
  await ctx.db.patch(cycle._id, { switchReads: next });
  const fresh = freshSwitches(next, now, staleAfter);

  for (const switchId of stale) {
    const device = await deviceOf(ctx, switchId);
    if (device) await setStatus(ctx, device, undefined);
  }
  const rows = await sightingRowsOf(ctx, site.objectId);
  const rowOf = new Map(rows.map((row) => [row.mac, row]));
  const settled = new Set<string>();
  for (const row of rows) {
    if (!stale.has(row.switchId)) continue;
    // The device carrying the MAC now, which no cycle may have recorded yet,
    // and the one the last cycle saw with it.
    const owners = [
      await ownerOf(ctx, site.objectId, row.mac),
      row.ownerId === undefined ? null : await deviceOf(ctx, row.ownerId),
    ];
    for (const owner of owners) {
      if (!owner || settled.has(owner.objectId)) continue;
      settled.add(owner.objectId);
      if (!PRESENT_TYPES.has(owner.type)) continue;
      await setStatus(
        ctx,
        owner,
        statusFrom(owner.macs, (mac) => rowOf.get(mac), fresh),
      );
    }
  }
};

/**
 * Places a device next to the wall socket it was seen at (ADR 0022): on the
 * socket's floor, at the free spot nearest to it on its side of the walls.
 * The move goes through the map's operations, so the server validates it as
 * a person's and the floors' revisions move. `clientId` names who moved it.
 * Returns whether it moved; a socket on no floor places nothing.
 */
export const placeNextTo = async (
  ctx: MutationCtx,
  device: Doc<"devices">,
  socketId: string,
  clientId = SIGHTED_BY,
): Promise<boolean> => {
  const socket = await deviceOf(ctx, socketId);
  if (!socket?.placement) return false;
  const { floorId } = socket.placement;
  const size = device.placement?.size ?? DEFAULT_DEVICE_SIZES[device.type];
  const others = (
    await ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
      .collect()
  ).flatMap((other) =>
    other.objectId === device.objectId || !other.placement
      ? []
      : [other.placement],
  );
  const walls = await ctx.db
    .query("walls")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  const spot = spotNextToSocket({
    floorId: floorId as FloorId,
    socket: socket.placement,
    size,
    others,
    walls: walls.map(getWallCollisionRect),
  });
  if (!spot) return false;

  let seq = 0;
  const apply = async (operation: AtomicMapOperationInput) => {
    seq += 1;
    const result = await applyMapOperation(ctx, {
      ...operation,
      meta: {
        opId: `${clientId}:${crypto.randomUUID()}`,
        clientId,
        clientSeq: seq,
        createdAt: Date.now(),
      },
    });
    return result.status === "applied";
  };
  if (device.placement?.floorId === floorId) {
    return await apply({
      kind: "device.patch",
      deviceId: device.objectId,
      patch: { position: spot },
    });
  }
  // An operation changes one floor, so another floor's device leaves it
  // first. Should the place be refused, it stays in the inventory, and the
  // next sighting places it again.
  if (
    device.placement &&
    !(await apply({ kind: "device.unplace", deviceId: device.objectId }))
  ) {
    return false;
  }
  return await apply({
    kind: "device.place",
    device: toPublicDevice(device, { floorId, position: spot, size }),
  });
};

/**
 * Records a cycle's sightings. A MAC not seen counts a miss when its switch
 * was read, so a LibreNMS that fails does not take devices offline, and a
 * status rests only on switches read recently enough (ADR 0025); a MAC no
 * device carries is forgotten once it is offline. Every MAC's owner is looked
 * up again, so a device that dropped a MAC, or a MAC whose device was
 * deleted, is settled too. A device seen at another socket than the last
 * time, or while on no floor, is placed next to the socket; where a person
 * put it is kept while the socket stays the same.
 */
export const recordSightings = internalMutation({
  args: {
    siteId: v.string(),
    cycleId: v.string(),
    baseUrl: v.string(),
    /** The switches read, with the status LibreNMS gives the device. */
    readSwitches: v.array(
      v.object({
        switchId: v.string(),
        status: v.optional(v.union(v.literal("up"), v.literal("down"))),
      }),
    ),
    sightings: v.array(sighting),
    tables: v.array(v.object({ deviceId: v.number(), table: fdbTable })),
  },
  returns: v.union(
    v.null(),
    v.object({
      seen: v.number(),
      online: v.number(),
      offline: v.number(),
      placed: v.number(),
      unknown: v.number(),
    }),
  ),
  handler: async (
    ctx,
    { siteId, cycleId, baseUrl, readSwitches, sightings, tables },
  ) => {
    const cycle = await cycleOf(ctx, siteId);
    if (cycle?.running?.cycleId !== cycleId) return null;
    // LibreNMS was removed or moved while it was read: its release already
    // settled the statuses, which this read must not bring back.
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_site_kind", (q) =>
        q.eq("siteId", siteId).eq("kind", "librenms"),
      )
      .unique();
    if (integration?.baseUrl !== baseUrl) return null;

    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    if (!site) return null;

    const now = Date.now();
    const read = new Set(tables.map(({ deviceId }) => deviceId));
    const readIds = new Set(readSwitches.map(({ switchId }) => switchId));
    const reads = [
      ...(cycle.switchReads ?? []).filter(
        ({ switchId }) => !readIds.has(switchId),
      ),
      ...[...readIds].map((switchId) => ({ switchId, readAt: now })),
    ];
    await ctx.db.patch(cycle._id, {
      librenmsTables: [
        ...(cycle.librenmsTables ?? []).filter(
          ({ deviceId }) => !read.has(deviceId),
        ),
        ...tables,
      ],
      switchReads: reads,
    });
    const fresh = freshSwitches(reads, now, staleAfterOf(site));
    for (const { switchId, status } of readSwitches) {
      const device = await deviceOf(ctx, switchId);
      if (device?.type === "switch") await setStatus(ctx, device, status);
    }

    const rows = await sightingRowsOf(ctx, siteId);
    const rowOf = new Map(rows.map((row) => [row.mac, row]));
    const sightingOf = new Map(sightings.map((one) => [one.mac, one]));
    const misses = new Map<string, number>();
    for (const row of rows) {
      // Past the offline mark a further miss changes nothing.
      const missed =
        !readIds.has(row.switchId) || row.misses >= MISSES_OFFLINE
          ? row.misses
          : row.misses + 1;
      misses.set(row.mac, missed);
    }
    for (const { mac } of sightings) misses.set(mac, 0);
    const seenOn = (mac: string) => {
      const missed = misses.get(mac);
      const switchId =
        sightingOf.get(mac)?.switchId ?? rowOf.get(mac)?.switchId;
      return missed === undefined || switchId === undefined
        ? undefined
        : { misses: missed, switchId };
    };

    const owners = new Map<string, Doc<"devices">>();
    const dropped = new Set<string>();
    const presentOwners = new Map<string, { id: string; placed: boolean }>();
    const ignored = await ignoredMacsOf(ctx, siteId);
    let unknown = 0;
    for (const [mac, missed] of misses) {
      const owner = await ownerOf(ctx, siteId, mac);
      const row = rowOf.get(mac);
      const seen = sightingOf.get(mac);
      if (owner) owners.set(owner.objectId, owner);
      else if (seen && !ignored.has(mac)) unknown += 1;
      if (row?.ownerId !== undefined && row.ownerId !== owner?.objectId) {
        dropped.add(row.ownerId);
      }
      if (owner && seen && PRESENT_TYPES.has(owner.type)) {
        presentOwners.set(mac, {
          id: owner.objectId,
          placed: owner.placement !== undefined,
        });
      }
      if (!owner && missed >= MISSES_OFFLINE) {
        if (row) await ctx.db.delete(row._id);
        continue;
      }
      const fields = {
        misses: missed,
        ownerId: owner?.objectId,
        ...(seen && {
          switchId: seen.switchId,
          portId: seen.portId,
          socketId: seen.socketId,
          seenAt: now,
        }),
      };
      if (!row && seen) {
        await ctx.db.insert("macSightings", {
          siteId,
          mac,
          ...fields,
          switchId: seen.switchId,
          portId: seen.portId,
          seenAt: now,
        });
      } else if (
        row &&
        (seen || row.misses !== missed || row.ownerId !== owner?.objectId)
      ) {
        await ctx.db.patch(row._id, fields);
      }
    }
    for (const deviceId of dropped) {
      const device = owners.has(deviceId)
        ? null
        : await deviceOf(ctx, deviceId);
      if (device) owners.set(deviceId, device);
    }

    let placed = 0;
    for (const [deviceId, socketId] of socketMoves(
      sightings,
      presentOwners,
      rows,
    )) {
      const device = owners.get(deviceId);
      if (device && (await placeNextTo(ctx, device, socketId))) placed += 1;
    }

    let online = 0;
    let offline = 0;
    for (const device of owners.values()) {
      if (!PRESENT_TYPES.has(device.type)) continue;
      // A device left with no MAC a fresh read saw has no status from the
      // network any more.
      const status = statusFrom(device.macs, seenOn, fresh);
      if (device.metadata.status === status) continue;
      await setStatus(ctx, device, status);
      if (status === "up") online += 1;
      else if (status === "down") offline += 1;
    }
    return { seen: sightingOf.size, online, offline, placed, unknown };
  },
});

/**
 * Forgets where the network saw the site's MAC addresses, and the statuses
 * it gave their devices and switches: without LibreNMS nothing would update
 * them.
 */
export const releaseLibreNMS = async (ctx: MutationCtx, siteId: string) => {
  const settled = new Set<string>();
  for (const row of await sightingRowsOf(ctx, siteId)) {
    const owners = [
      await ownerOf(ctx, siteId, row.mac),
      row.ownerId === undefined ? null : await deviceOf(ctx, row.ownerId),
    ];
    for (const owner of owners) {
      if (!owner || settled.has(owner.objectId)) continue;
      settled.add(owner.objectId);
      if (PRESENT_TYPES.has(owner.type) && owner.metadata.status) {
        await setStatus(ctx, owner, undefined);
      }
    }
    await ctx.db.delete(row._id);
  }
  const cycle = await cycleOf(ctx, siteId);
  if (!cycle) return;
  for (const { switchId } of cycle.switchReads ?? []) {
    const device = await deviceOf(ctx, switchId);
    if (device) await setStatus(ctx, device, undefined);
  }
  if (cycle.librenmsTables || cycle.switchReads) {
    await ctx.db.patch(cycle._id, {
      librenmsTables: undefined,
      switchReads: undefined,
    });
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
 * `last_discovered` when asked and sets it once done. Returns why a device
 * could not be asked, the devices that did not finish in time, and those
 * that did.
 */
const rediscover = async (
  readOnce: LibreNMSRead,
  trigger: LibreNMSRead,
  devices: ReadonlyArray<{ id: number; name: string }>,
): Promise<{
  failures: Array<string>;
  unfinished: Array<string>;
  finished: Set<number>;
}> => {
  const failures: Array<string> = [];
  const before = new Map<number, string | null>();
  for (const device of devices) {
    const current = await readOnce(`/api/v0/devices/${device.id}`);
    if (!current.ok) {
      failures.push(`« ${device.name} » : ${current.message}`);
      continue;
    }
    const asked = await trigger(`/api/v0/devices/${device.id}/discover`);
    if (!asked.ok) {
      failures.push(
        `« ${device.name} » n'a pas pu lancer sa découverte : ${asked.message}`,
      );
    }
    // An answer other than a server error says the request did not start
    // one; a timeout or a 5xx may have, and only waiting tells.
    const refused =
      !asked.ok && asked.status !== undefined && asked.status < 500;
    if (!refused) before.set(device.id, readLastDiscovered(current.body));
  }
  const asked = new Set(before.keys());
  const deadline = Date.now() + DISCOVERY_WAIT_MS;
  while (before.size > 0) {
    for (const [id, last] of before) {
      const answer = await readOnce(`/api/v0/devices/${id}`);
      const now = answer.ok ? readLastDiscovered(answer.body) : null;
      if (now !== null && now !== last) before.delete(id);
    }
    if (before.size === 0 || Date.now() + DISCOVERY_POLL_MS > deadline) break;
    await pause(DISCOVERY_POLL_MS);
  }
  const unfinished = devices
    .filter((device) => before.has(device.id))
    .map((device) => device.name);
  const finished = new Set([...asked].filter((id) => !before.has(id)));
  return { failures, unfinished, finished };
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
  // Asking for a discovery has an effect: a retry could ask again at once.
  const trigger: LibreNMSRead = async (path) =>
    await sourceGet("librenms", baseUrl, path, token, {
      ...PROBE_RETRY,
      attempts: 1,
    });

  const notes: Array<string> = [];
  let discoveryFailed = false;
  let finished = new Set<number>();
  if (
    plan.discover &&
    plan.devices.length > 0 &&
    (await ctx.runMutation(internal.librenmsCycle.markDiscovery, {
      siteId,
      cycleId,
    }))
  ) {
    const discovery = await rediscover(readOnce, trigger, plan.devices);
    const { failures, unfinished } = discovery;
    finished = discovery.finished;
    discoveryFailed = failures.length > 0;
    notes.push(
      ...failures,
      ...unfinished.map(
        (name) => `« ${name} » n'a pas fini sa découverte à temps.`,
      ),
    );
  }

  const failedSwitchIds: Array<string> = [];
  const readSwitches: Array<{ switchId: string; status?: "up" | "down" }> = [];
  const fdb: Array<FdbEntry> = [];
  const tables: Array<{ deviceId: number; table: FdbTable }> = [];
  const matched = new Map<number, string>();
  const ports: Array<SwitchPort> = [];
  let readCount = 0;
  for (const device of plan.devices) {
    const [state, portList, fdbList] = await Promise.all([
      read(`/api/v0/devices/${device.id}`),
      read(`/api/v0/devices/${device.id}/ports?columns=port_id,ifName,ifDescr`),
      read(`/api/v0/devices/${device.id}/fdb`),
    ]);
    if (!state.ok || !portList.ok || !fdbList.ok) {
      failedSwitchIds.push(...device.switchIds);
      const reason = [state, portList, fdbList].find(
        (answer): answer is Extract<typeof answer, { ok: false }> => !answer.ok,
      );
      if (reason) notes.push(`« ${device.name} » : ${reason.message}`);
      continue;
    }
    const status = readLibreNMSDeviceStatus(state.body) ?? undefined;
    for (const switchId of device.switchIds) {
      readSwitches.push({ switchId, ...(status && { status }) });
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
    const entries = readLibreNMSFdb(fdbList.body);
    const { fresh, table } = freshFdb(
      entries,
      device.fdbTable,
      finished.has(device.id),
    );
    if (table) tables.push({ deviceId: device.id, table });
    if (entries.length > 0 && fresh.length === 0) {
      notes.push(
        `« ${device.name} » : sa dernière découverte n'a rafraîchi aucune entrée.`,
      );
    }
    fdb.push(...fresh);
    ports.push(...own);
    readCount += 1;
  }

  const counts = await ctx.runMutation(internal.librenmsCycle.recordSightings, {
    siteId,
    cycleId,
    baseUrl,
    readSwitches,
    sightings: edgeSightings(fdb, matched, ports),
    tables,
  });
  if (!counts) return { ok: true, message: "" };
  if (plan.devices.length === 0) {
    return { ok: true, message: "Aucun switch n'est interrogé." };
  }
  return {
    ok: failedSwitchIds.length === 0 && !discoveryFailed,
    message: [
      sightingSummary({ switches: readCount, ...counts }),
      ...notes,
    ].join(" "),
  };
};
