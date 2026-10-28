// The LibreNMS step of a collection cycle (ADRs 0022 and 0023): the polled
// switches rediscover, their ports and forwarding tables are read, and each
// MAC address seen on an edge port is recorded where it was seen. A `pc` or
// `endpoint` comes online when one of its MACs is seen, and goes offline
// once none has been for two cycles; one seen at a new socket, or while on no
// floor, is placed next to it.
import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { cycleOf } from "./lib/cycles";
import {
  claimSlot,
  placeNamer,
  recordLocated,
  recordPresence,
  SNAPSHOT_PAGE,
} from "./history";
import { macSighting } from "./historyValidators";
import { ignoredMacsOf } from "./lib/ignoredMacs";
import {
  carries,
  PRESENT_TYPES,
  staleAfterOf,
  statusFrom,
  withObservation,
} from "./lib/statuses";
import type { Observation } from "./lib/statuses";
import { toPublicDevice } from "./mapDocument";
import { applyMapOperation, getWallCollisionRect } from "./mapOperations";
import type { OperationInput } from "./mapOperations";
import { pause, SOURCE_RETRY } from "./lib/httpRetry";
import { PROBE_RETRY, sourceGet } from "./lib/integrationProbe";
import type { Source } from "./lib/integrationProbe";
import { cableRowAt, portRowsOf, traceRows } from "./lib/ports";
import type { switchResult } from "./siteValidators";
import { fdbTable } from "./siteValidators";
import { DEFAULT_DEVICE_SIZES } from "../src/devices/deviceSizes";
import { EMPTY_LIBRENMS_SETTINGS, polledSwitches } from "../src/sites/librenms";
import { spotNextToSocket } from "../src/sites/socketPlacement";
import {
  adoptedPorts,
  edgeSightings,
  ethernetNames,
  portPresence,
  freshFdb,
  freshSwitches,
  matchPorts,
  MISSES_OFFLINE,
  newestFdbEntry,
  portMoves,
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

const upOrDown = v.union(v.literal("up"), v.literal("down"));

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

/** Whether a device of the site carries one of these MACs. */
const someOwned = async (
  ctx: QueryCtx,
  siteId: string,
  macs: ReadonlyArray<string>,
) => {
  for (const mac of macs) {
    if (await ownerOf(ctx, siteId, mac)) return true;
  }
  return false;
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
      endId: v.union(v.null(), v.string()),
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
          endId: end?.deviceId ?? null,
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
  observation: Observation,
) => {
  if (carries(device.metadata, observation)) return;
  await ctx.db.patch(device._id, {
    metadata: withObservation(device.metadata, observation),
    updatedAt: Date.now(),
    updatedBy: SIGHTED_BY,
  });
};

/** What LibreNMS says of a switch it read; none when it said nothing. */
const switchObservation = (status: "up" | "down" | undefined): Observation =>
  status ? { status } : undefined;

/**
 * Sets what a switch's read observed on each of its ports (ADR 0025), only
 * where it changed: nothing clears both facts.
 */
const setPortFacts = async (
  ctx: MutationCtx,
  switchId: string,
  factsOf: (port: Doc<"ports">) => { status?: "up" | "down"; seen?: true },
) => {
  for (const port of await portRowsOf(ctx, switchId)) {
    const { status, seen } = factsOf(port);
    if (port.status === status && port.seen === seen) continue;
    await ctx.db.patch(port._id, { status, seen });
  }
};

/**
 * Removes what rests on a switch read that has grown too old (ADR 0025): the
 * switch's status and its ports' facts, and the status of devices last seen
 * on it unless another switch still vouches for them. Run every minute, so it
 * holds when LibreNMS fails, the switch is no longer polled, or cycles stop.
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

  for (const read of reads) {
    if (!stale.has(read.switchId)) continue;
    const device = await deviceOf(ctx, read.switchId);
    // A switch LibreNMS gave a status to has had no news since this read.
    const status = device?.metadata.status;
    if (device) {
      await setStatus(
        ctx,
        device,
        status === "up" || status === "down" || status === "stale"
          ? {
              status: "stale",
              lastSeenAt:
                status === "stale"
                  ? (device.metadata.lastSeenAt ?? read.readAt)
                  : read.readAt,
            }
          : undefined,
      );
    }
    await setPortFacts(ctx, read.switchId, () => ({}));
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
 * The site's cycle while `cycleId` still runs it against LibreNMS at
 * `baseUrl`. When LibreNMS was removed or moved while it was read, its
 * release already settled what the read would write, which must not come
 * back.
 */
const heldCycle = async (
  ctx: QueryCtx,
  siteId: string,
  cycleId: string,
  baseUrl: string,
) => {
  const cycle = await cycleOf(ctx, siteId);
  if (cycle?.running?.cycleId !== cycleId) return null;
  const integration = await ctx.db
    .query("integrations")
    .withIndex("by_site_kind", (q) =>
      q.eq("siteId", siteId).eq("kind", "librenms"),
    )
    .unique();
  return integration?.baseUrl === baseUrl ? { cycle, integration } : null;
};

/**
 * Gives a switch whose ports still carry their default names those of the
 * LibreNMS device it alone stands for (`adoptedPorts`); whether its ports
 * changed.
 */
export const adoptPortNames = internalMutation({
  args: {
    siteId: v.string(),
    cycleId: v.string(),
    baseUrl: v.string(),
    switchId: v.string(),
    librenmsDeviceId: v.number(),
    names: v.array(v.string()),
  },
  returns: v.boolean(),
  handler: async (
    ctx,
    { siteId, cycleId, baseUrl, switchId, librenmsDeviceId, names },
  ) => {
    const held = await heldCycle(ctx, siteId, cycleId, baseUrl);
    if (!held) return false;
    // An admin may have mapped the switch elsewhere while it was read.
    const mapped = polledSwitches(
      held.integration.librenms ?? EMPTY_LIBRENMS_SETTINGS,
    ).filter(({ device }) => device.id === librenmsDeviceId);
    if (mapped.length !== 1 || mapped[0]?.switchId !== switchId) return false;
    const device = await deviceOf(ctx, switchId);
    if (device?.siteId !== siteId || device.type !== "switch") return false;
    const rows = await portRowsOf(ctx, switchId);
    const own = await Promise.all(
      rows.map(async (row) => ({
        id: row.objectId,
        name: row.name,
        kind: row.kind,
        order: row.order,
        cabled: (await cableRowAt(ctx, row.objectId)) !== null,
        sourced: row.source !== undefined,
      })),
    );
    const plan = adoptedPorts(switchId, own, names);
    if (!plan) return false;
    const rowOf = new Map(rows.map((row) => [row.objectId, row]));
    for (const { id, name } of plan.rename) {
      const row = rowOf.get(id);
      if (row) await ctx.db.patch(row._id, { name });
    }
    for (const id of plan.remove) {
      const row = rowOf.get(id);
      if (row) await ctx.db.delete(row._id);
    }
    for (const { id, name, order } of plan.add) {
      await ctx.db.insert("ports", {
        objectId: id,
        siteId,
        deviceId: switchId,
        name,
        kind: "interface",
        order,
      });
    }
    return plan.rename.length + plan.add.length + plan.remove.length > 0;
  },
});

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
        status: v.optional(upOrDown),
      }),
    ),
    /** The links LibreNMS knows of the read switches' ports. */
    links: v.array(v.object({ portId: v.string(), link: upOrDown })),
    presence: v.array(
      v.object({
        portId: v.string(),
        macs: v.array(v.string()),
        deviceId: v.optional(v.string()),
      }),
    ),
    sightings: v.array(macSighting),
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
      /** The snapshot slot the cycle took, for the action to write. */
      snapshot: v.optional(v.id("historySlots")),
    }),
  ),
  handler: async (
    ctx,
    {
      siteId,
      cycleId,
      baseUrl,
      readSwitches,
      links,
      presence,
      sightings,
      tables,
    },
  ) => {
    const held = await heldCycle(ctx, siteId, cycleId, baseUrl);
    if (!held) return null;
    const { cycle } = held;

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
      if (device?.type === "switch") {
        await setStatus(ctx, device, switchObservation(status));
      }
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
      const seenAt = sightingOf.has(mac) ? now : rowOf.get(mac)?.seenAt;
      return missed === undefined ||
        switchId === undefined ||
        seenAt === undefined
        ? undefined
        : { misses: missed, switchId, seenAt };
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

    const seenPorts = new Set<string>();
    for (const { portId, macs, deviceId } of presence) {
      const device =
        deviceId === undefined ? null : await deviceOf(ctx, deviceId);
      const seen =
        deviceId === undefined
          ? await someOwned(ctx, siteId, macs)
          : device !== null && macs.some((mac) => device.macs.includes(mac));
      if (seen) seenPorts.add(portId);
    }
    const linkOf = new Map(links.map(({ portId, link }) => [portId, link]));
    for (const switchId of readIds) {
      await setPortFacts(ctx, switchId, (port) => ({
        status: linkOf.get(port.objectId),
        ...(seenPorts.has(port.objectId) && { seen: true }),
      }));
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
    const placeOf = placeNamer(ctx);
    for (const [deviceId, { seen, first }] of portMoves(
      sightings,
      presentOwners,
      rows,
    )) {
      const device = owners.get(deviceId);
      if (device) {
        await recordLocated(ctx, device, await placeOf(seen), now, {
          unlessLast: first,
        });
      }
    }

    let online = 0;
    let offline = 0;
    for (const device of owners.values()) {
      if (!PRESENT_TYPES.has(device.type)) continue;
      // A device left with no MAC a fresh read saw has no status from the
      // network any more.
      const observation = statusFrom(device.macs, seenOn, fresh);
      if (carries(device.metadata, observation)) continue;
      await setStatus(ctx, device, observation);
      const status = observation?.status;
      if (status === "up") {
        online += 1;
        await recordPresence(ctx, device, "online", now);
      } else if (status === "down") {
        offline += 1;
        const lastSeenAt = Math.max(
          ...device.macs.map((mac) => rowOf.get(mac)?.seenAt ?? 0),
        );
        await recordPresence(
          ctx,
          device,
          "offline",
          now,
          lastSeenAt > 0 ? lastSeenAt : undefined,
        );
      }
    }
    const snapshot =
      sightings.length > 0 ? await claimSlot(ctx, site, now) : null;
    return {
      seen: sightingOf.size,
      online,
      offline,
      placed,
      unknown,
      ...(snapshot && { snapshot }),
    };
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
    await setPortFacts(ctx, switchId, () => ({}));
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

type SwitchResult = Infer<typeof switchResult>;

/**
 * Asks each device to rediscover and waits, up to two minutes, until
 * LibreNMS records a new discovery for each. LibreNMS clears a device's
 * `last_discovered` when asked and sets it once done. Returns why a device
 * could not be asked, the devices that did not finish in time, and those
 * that did.
 */
/**
 * The note for a device LibreNMS answers 404 for: it was deleted there.
 * Santé puts the way out, a link to the switch mapping, under it.
 */
export const MISSING_NOTE = "n'existe plus dans LibreNMS (404).";

// A 404 on a device's own path says the device is gone, not the API.
const deviceFailure = (answer: { message: string; status?: number }) =>
  answer.status === 404 ? MISSING_NOTE : answer.message;

const rediscover = async (
  readOnce: LibreNMSRead,
  trigger: LibreNMSRead,
  devices: ReadonlyArray<{ id: number; name: string }>,
): Promise<{
  failures: Map<number, string>;
  unfinished: Set<number>;
  finished: Set<number>;
}> => {
  const failures = new Map<number, string>();
  const before = new Map<number, string | null>();
  for (const device of devices) {
    const current = await readOnce(`/api/v0/devices/${device.id}`);
    if (!current.ok) {
      failures.set(device.id, deviceFailure(current));
      continue;
    }
    const asked = await trigger(`/api/v0/devices/${device.id}/discover`);
    if (!asked.ok) {
      failures.set(
        device.id,
        `sa découverte n'a pas pu être lancée. ${asked.message}`,
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
  const unfinished = new Set(before.keys());
  const finished = new Set([...asked].filter((id) => !before.has(id)));
  return { failures, unfinished, finished };
};

/** Reads the polled switches from LibreNMS and records what they saw. */
export const collectFromLibreNMS = async (
  ctx: ActionCtx,
  siteId: string,
  cycleId: string,
  connection: Source,
): Promise<{
  ok: boolean;
  message: string;
  switches?: Array<SwitchResult>;
}> => {
  const plan = await ctx.runQuery(internal.librenmsCycle.cyclePlan, {
    siteId,
    cycleId,
  });
  // The address changed since the connection was opened.
  if (!plan || plan.baseUrl !== connection.baseUrl) {
    return { ok: true, message: "" };
  }
  const read: LibreNMSRead = async (path) =>
    await sourceGet(connection, path, SOURCE_RETRY);
  const readOnce: LibreNMSRead = async (path) =>
    await sourceGet(connection, path, PROBE_RETRY);
  // Asking for a discovery has an effect: a retry could ask again at once.
  const trigger: LibreNMSRead = async (path) =>
    await sourceGet(connection, path, {
      ...PROBE_RETRY,
      attempts: 1,
    });

  // What each device's line in the step says after its name.
  const notes = new Map<number, Array<string>>();
  // A device gone from LibreNMS fails its discovery and its read alike.
  const note = (deviceId: number, phrase: string) => {
    const current = notes.get(deviceId) ?? [];
    if (!current.includes(phrase)) notes.set(deviceId, [...current, phrase]);
  };
  const failed = new Set<number>();
  let finished = new Set<number>();
  // What a switch's table looked like before its discovery, when no earlier
  // read says it: the only way to tell, on a first read, a discovery that
  // refreshed nothing.
  const before = new Map<number, FdbTable>();
  if (
    plan.discover &&
    plan.devices.length > 0 &&
    (await ctx.runMutation(internal.librenmsCycle.markDiscovery, {
      siteId,
      cycleId,
    }))
  ) {
    for (const device of plan.devices) {
      if (device.fdbTable) continue;
      const answer = await readOnce(`/api/v0/devices/${device.id}/fdb`);
      const newest = answer.ok
        ? newestFdbEntry(readLibreNMSFdb(answer.body))
        : null;
      if (newest !== null) before.set(device.id, { newest });
    }
    const discovery = await rediscover(readOnce, trigger, plan.devices);
    finished = discovery.finished;
    for (const [deviceId, reason] of discovery.failures) {
      failed.add(deviceId);
      note(deviceId, reason);
    }
    for (const deviceId of discovery.unfinished) {
      note(deviceId, "sa découverte n'a pas fini à temps.");
    }
  }

  const readSwitches: Array<{ switchId: string; status?: "up" | "down" }> = [];
  const fdb: Array<FdbEntry> = [];
  const tables: Array<{ deviceId: number; table: FdbTable }> = [];
  const matched = new Map<number, string>();
  const links: Array<{ portId: string; link: "up" | "down" }> = [];
  const ports: Array<SwitchPort> = [];
  let readCount = 0;
  for (const device of plan.devices) {
    const [state, portList, fdbList] = await Promise.all([
      read(`/api/v0/devices/${device.id}`),
      read(
        `/api/v0/devices/${device.id}/ports?columns=port_id,ifIndex,ifName,ifDescr,ifType,ifOperStatus`,
      ),
      read(`/api/v0/devices/${device.id}/fdb`),
    ]);
    if (!state.ok || !portList.ok || !fdbList.ok) {
      failed.add(device.id);
      const reason = [state, portList, fdbList].find(
        (answer): answer is Extract<typeof answer, { ok: false }> => !answer.ok,
      );
      if (reason) note(device.id, deviceFailure(reason));
      continue;
    }
    const status = readLibreNMSDeviceStatus(state.body) ?? undefined;
    for (const switchId of device.switchIds) {
      readSwitches.push({ switchId, ...(status && { status }) });
    }
    const { switchIds } = device;
    let own = await ctx.runQuery(internal.librenmsCycle.switchPorts, {
      switchIds,
    });
    const librenmsPorts = readLibreNMSPorts(portList.body);
    const names = ethernetNames(librenmsPorts);
    // A LibreNMS device standing for several switches does not say which of
    // its ports is whose.
    const sole = switchIds.length === 1 ? switchIds[0] : undefined;
    if (
      sole !== undefined &&
      names.length > 0 &&
      own.length > 0 &&
      own.every(({ name }) => /^\d+$/.test(name)) &&
      (await ctx.runMutation(internal.librenmsCycle.adoptPortNames, {
        siteId,
        cycleId,
        baseUrl: connection.baseUrl,
        switchId: sole,
        librenmsDeviceId: device.id,
        names,
      }))
    ) {
      own = await ctx.runQuery(internal.librenmsCycle.switchPorts, {
        switchIds,
      });
    }
    const linkOf = new Map(librenmsPorts.map(({ id, link }) => [id, link]));
    // LibreNMS numbers ports across all its devices, so the maps merge.
    for (const [portId, ownId] of matchPorts(librenmsPorts, own)) {
      matched.set(portId, ownId);
      const link = linkOf.get(portId);
      if (link) links.push({ portId: ownId, link });
    }
    const entries = readLibreNMSFdb(fdbList.body);
    const { fresh, table } = freshFdb(
      entries,
      device.fdbTable ?? before.get(device.id),
      finished.has(device.id),
    );
    if (table) tables.push({ deviceId: device.id, table });
    if (entries.length > 0 && fresh.length === 0) {
      note(
        device.id,
        "LibreNMS ne rafraîchit plus la table d'adresses de ce switch : vérifiez sa découverte dans LibreNMS.",
      );
    }
    fdb.push(...fresh);
    ports.push(...own);
    readCount += 1;
  }

  const sightings = edgeSightings(fdb, matched, ports);
  const recorded = await ctx.runMutation(
    internal.librenmsCycle.recordSightings,
    {
      siteId,
      cycleId,
      baseUrl: connection.baseUrl,
      readSwitches,
      links,
      presence: portPresence(fdb, matched, ports),
      sightings,
      tables,
    },
  );
  if (!recorded) return { ok: true, message: "" };
  const { snapshot, ...counts } = recorded;
  if (snapshot) {
    // From what this cycle read, so a later cycle cannot mix into it.
    for (let start = 0; start < sightings.length; start += SNAPSHOT_PAGE) {
      const end = start + SNAPSHOT_PAGE;
      await ctx.runMutation(internal.history.captureSlot, {
        slotId: snapshot,
        sightings: sightings.slice(start, end),
        ...(end >= sightings.length && { total: sightings.length }),
      });
    }
  }
  if (plan.devices.length === 0) {
    return { ok: true, message: "Aucun switch n'est interrogé." };
  }
  const switches = plan.devices.map((device) => {
    const deviceNotes = notes.get(device.id) ?? [];
    return {
      name: device.name,
      ok: !failed.has(device.id),
      notes: deviceNotes,
      ...(deviceNotes.includes(MISSING_NOTE) && { missing: true }),
    };
  });
  // Each switch's own trouble is in `switches`; the step says how many.
  return {
    ok: failed.size === 0,
    message: sightingSummary({
      switches: readCount,
      polled: plan.devices.length,
      ...counts,
    }),
    switches,
  };
};
