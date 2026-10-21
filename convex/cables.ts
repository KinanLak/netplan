import { ConvexError, v } from "convex/values";
import { editorMutation, readerQuery } from "./lib/functions";
import {
  cableRow,
  cableRowAt,
  portRowOf,
  portRowsOf,
  toCable,
  traceRows,
} from "./lib/ports";
import {
  cableEnd,
  deviceStatus,
  deviceType,
  newCable,
  portKind,
  sourceRef,
} from "./mapValidators";
import { comparePorts, isCableId } from "../src/devices/ports";
import { INTEGRATION_LABELS } from "../src/sites/integrations";
import { placeNamer } from "./history";
import { historyPlace } from "./historyValidators";
import { ownerOf } from "./librenmsCycle";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** A port at the other end of a cable or a trace, named for a person. */
const portEnd = v.object({
  deviceId: v.string(),
  deviceName: v.string(),
  deviceType,
  portId: v.string(),
  portName: v.string(),
  portKind,
  /** "Bâtiment · Étage", or `null` for a device on no floor. */
  place: v.union(v.null(), v.string()),
});

const observation = v.object({
  deviceId: v.optional(v.string()),
  name: v.string(),
  at: v.number(),
  /** Seen by the switch's last read, rather than earlier. */
  current: v.boolean(),
});

// A port with more is a trunk or an uplink; its first few say enough.
const OBSERVED_SHOWN = 5;

/** Where the network last saw a device: its newest sighting, named. */
export const lastSightingOf = async (
  ctx: QueryCtx,
  device: Pick<Doc<"devices">, "siteId" | "macs">,
) => {
  let latest: Doc<"macSightings"> | null = null;
  for (const mac of device.macs) {
    const row = await ctx.db
      .query("macSightings")
      .withIndex("by_site_mac", (q) =>
        q.eq("siteId", device.siteId).eq("mac", mac),
      )
      .unique();
    if (row && (!latest || row.seenAt > latest.seenAt)) latest = row;
  }
  if (!latest) return null;
  return {
    place: await placeNamer(ctx)(latest),
    at: latest.seenAt,
    current: latest.misses === 0,
  };
};

export const lastSighting = v.union(
  v.null(),
  v.object({ place: historyPlace, at: v.number(), current: v.boolean() }),
);

/**
 * What a switch port or a socket saw, named by the devices of the site. A
 * socket's sightings go on its front port, or on its only port when a source
 * models it with a rear port alone.
 */
const observedOn = async (
  ctx: QueryCtx,
  device: Doc<"devices">,
  port: Doc<"ports">,
  socketPortId: string | undefined,
) => {
  const rows =
    device.type === "switch"
      ? await ctx.db
          .query("macSightings")
          .withIndex("by_site_switch_port", (q) =>
            q
              .eq("siteId", device.siteId)
              .eq("switchId", device.objectId)
              .eq("portId", port.objectId),
          )
          .collect()
      : port.objectId === socketPortId
        ? await ctx.db
            .query("macSightings")
            .withIndex("by_site_socket", (q) =>
              q.eq("siteId", device.siteId).eq("socketId", device.objectId),
            )
            .collect()
        : [];
  const newest = rows
    .toSorted((a, b) => b.seenAt - a.seenAt)
    .slice(0, OBSERVED_SHOWN);
  return await Promise.all(
    newest.map(async (row) => {
      const owner = await ownerOf(ctx, device.siteId, row.mac);
      return {
        ...(owner && { deviceId: owner.objectId }),
        name: owner?.name ?? row.mac,
        at: row.seenAt,
        current: row.misses === 0,
      };
    }),
  );
};

const portTableRow = v.object({
  id: v.string(),
  name: v.string(),
  kind: portKind,
  order: v.number(),
  status: v.optional(deviceStatus),
  seen: v.optional(v.literal(true)),
  source: v.optional(sourceRef),
  cable: v.union(
    v.null(),
    v.object({ id: v.string(), source: v.optional(sourceRef), far: portEnd }),
  ),
  /** Where the trace ends, when it goes past the cable's far end. */
  traceEnd: v.union(v.null(), portEnd),
  /**
   * What the network saw on the port, a switch's or a socket's, newest
   * first: the device carrying the MAC, or the MAC itself.
   */
  observed: v.array(observation),
});

/** Names the devices and places of the ports a table shows, reading each once. */
const portEndNamer = (ctx: QueryCtx) => {
  const devices = new Map<string, Promise<Doc<"devices"> | null>>();
  const places = new Map<string, Promise<string | null>>();
  const deviceOf = (deviceId: string) => {
    let device = devices.get(deviceId);
    if (!device) {
      device = ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
        .unique();
      devices.set(deviceId, device);
    }
    return device;
  };
  const placeOf = (floorId: string) => {
    let place = places.get(floorId);
    if (!place) {
      place = (async () => {
        const floor = await ctx.db
          .query("floors")
          .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
          .unique();
        if (!floor) return null;
        const building = await ctx.db
          .query("buildings")
          .withIndex("by_object_id", (q) => q.eq("objectId", floor.buildingId))
          .unique();
        return building ? `${building.name} · ${floor.name}` : floor.name;
      })();
      places.set(floorId, place);
    }
    return place;
  };
  return async (port: Doc<"ports">) => {
    const device = await deviceOf(port.deviceId);
    if (!device) return null;
    return {
      deviceId: device.objectId,
      deviceName: device.name,
      deviceType: device.type,
      portId: port.objectId,
      portName: port.name,
      portKind: port.kind,
      place: device.placement ? await placeOf(device.placement.floorId) : null,
    };
  };
};

/**
 * A device's ports with their cables and where each trace ends, wherever in
 * the site the far ends stand. `null` when the device is gone.
 */
export const portTable = readerQuery({
  args: { deviceId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      siteId: v.string(),
      deviceType,
      ports: v.array(portTableRow),
      /** Where the network last saw the device itself, by its MACs. */
      lastSeen: lastSighting,
    }),
  ),
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
      .unique();
    if (!device) return null;
    const nameEnd = portEndNamer(ctx);
    const rows = (await portRowsOf(ctx, deviceId)).sort(comparePorts);
    const socketPortId =
      device.type === "wall-port"
        ? (rows.find((row) => row.kind === "front") ?? rows.at(0))?.objectId
        : undefined;
    const ports = await Promise.all(
      rows.map(async (row) => {
        const cable = await cableRowAt(ctx, row.objectId);
        const hops = cable ? await traceRows(ctx, row) : [];
        const far = hops[0] ? await nameEnd(hops[0]) : null;
        const last = hops.at(-1);
        return {
          id: row.objectId,
          name: row.name,
          kind: row.kind,
          order: row.order,
          status: row.status,
          seen: row.seen,
          source: row.source,
          cable:
            cable && far
              ? { id: cable.objectId, source: cable.source, far }
              : null,
          traceEnd: last && hops.length > 1 ? await nameEnd(last) : null,
          observed: await observedOn(ctx, device, row, socketPortId),
        };
      }),
    );
    return {
      siteId: device.siteId,
      deviceType: device.type,
      ports,
      lastSeen: await lastSightingOf(ctx, device),
    };
  },
});

/**
 * Joins two free ports of one site with a manual cable. The client names it,
 * so the "Annuler" of a disconnection brings back the same cable.
 */
export const connect = editorMutation({
  args: newCable.fields,
  returns: v.null(),
  handler: async (ctx, { id, a, b }) => {
    if (!isCableId(id))
      throw new ConvexError("Cet identifiant de câble est invalide.");
    if (a.portId === b.portId) {
      throw new ConvexError("Un câble relie deux ports différents.");
    }
    const ends = await Promise.all(
      [a, b].map(async (end) => {
        const port = await portRowOf(ctx, end.portId);
        if (port?.deviceId !== end.deviceId) {
          throw new ConvexError("Ce port n'existe plus.");
        }
        if (await cableRowAt(ctx, end.portId)) {
          throw new ConvexError(`Le port ${port.name} est déjà câblé.`);
        }
        return port;
      }),
    );
    const [portA, portB] = ends;
    if (portA.siteId !== portB.siteId) {
      throw new ConvexError("Un câble relie deux ports du même site.");
    }
    const taken = await ctx.db
      .query("cables")
      .withIndex("by_object_id", (q) => q.eq("objectId", id))
      .unique();
    if (taken) throw new ConvexError("Cet identifiant de câble est déjà pris.");
    await ctx.db.insert(
      "cables",
      cableRow(portA.siteId, { id, a, b }, Date.now(), ctx.user.id),
    );
    return null;
  },
});

/**
 * Removes a manual cable and returns it, so `connect` can undo it; `null`
 * when it was already gone. A source's cable would come back at its next
 * sync, so it is refused.
 */
export const disconnect = editorMutation({
  args: { cableId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ id: v.string(), a: cableEnd, b: cableEnd }),
  ),
  handler: async (ctx, { cableId }) => {
    const row = await ctx.db
      .query("cables")
      .withIndex("by_object_id", (q) => q.eq("objectId", cableId))
      .unique();
    if (!row) return null;
    if (row.source) {
      throw new ConvexError(
        `Ce câble vient de ${INTEGRATION_LABELS[row.source.integration]} : il ne se débranche pas dans Netplan.`,
      );
    }
    await ctx.db.delete(row._id);
    const { source: _, ...cable } = toCable(row);
    return cable;
  },
});
