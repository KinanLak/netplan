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
    v.object({ siteId: v.string(), ports: v.array(portTableRow) }),
  ),
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
      .unique();
    if (!device) return null;
    const nameEnd = portEndNamer(ctx);
    const rows = (await portRowsOf(ctx, deviceId)).sort(comparePorts);
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
        };
      }),
    );
    return { siteId: device.siteId, ports };
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
