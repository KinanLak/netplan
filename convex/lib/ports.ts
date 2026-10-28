import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { cable, newCable, newPort, port } from "../mapValidators";
import { observedPort } from "./statuses";
import {
  MAX_PORTS_PER_DEVICE,
  cablesToLay,
  defaultPorts,
  portListError,
  traceFrom,
} from "../../src/devices/ports";
import type { DeviceId, DeviceType } from "../../src/types/map";

export type PortValue = Infer<typeof port>;
export type CableValue = Infer<typeof cable>;
export type NewPort = Infer<typeof newPort>;
export type NewCable = Infer<typeof newCable>;

/** The ports a new device has: the ones given, or its type's defaults. */
export const portsForNewDevice = (
  deviceId: string,
  type: DeviceType,
  ports: Array<NewPort> | undefined,
): Array<NewPort> =>
  // Validators type ids as plain strings; the defaults are branded.
  ports ?? defaultPorts(deviceId as DeviceId, type);

export const toPort = (row: Doc<"ports">): PortValue => ({
  id: row.objectId,
  deviceId: row.deviceId,
  name: row.name,
  kind: row.kind,
  order: row.order,
  rearPortId: row.rearPortId,
  status: row.status,
  seen: row.seen,
  source: row.source,
});

export const toCable = (row: Doc<"cables">): CableValue => ({
  id: row.objectId,
  a: { deviceId: row.aDeviceId, portId: row.aPortId },
  b: { deviceId: row.bDeviceId, portId: row.bPortId },
  source: row.source,
});

export const portRow = (siteId: string, value: NewPort) => ({
  objectId: value.id,
  siteId,
  deviceId: value.deviceId,
  name: value.name,
  kind: value.kind,
  order: value.order,
  rearPortId: value.rearPortId,
  status: value.status,
  seen: value.seen,
});

export const cableRow = (
  siteId: string,
  value: NewCable,
  updatedAt: number,
  updatedBy: string,
) => ({
  objectId: value.id,
  siteId,
  aDeviceId: value.a.deviceId,
  aPortId: value.a.portId,
  bDeviceId: value.b.deviceId,
  bPortId: value.b.portId,
  updatedAt,
  updatedBy,
});

export const portRowsOf = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("ports")
    .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
    .collect();

/** The cables with an end on a device, each once. */
export const cableRowsOf = async (ctx: QueryCtx, deviceId: string) => {
  const [fromA, fromB] = await Promise.all([
    ctx.db
      .query("cables")
      .withIndex("by_a_device", (q) => q.eq("aDeviceId", deviceId))
      .collect(),
    ctx.db
      .query("cables")
      .withIndex("by_b_device", (q) => q.eq("bDeviceId", deviceId))
      .collect(),
  ]);
  return [...fromA, ...fromB.filter((row) => row.aDeviceId !== deviceId)];
};

/** The cable plugged into a port, if any. */
export const cableRowAt = async (ctx: QueryCtx, portId: string) =>
  (await ctx.db
    .query("cables")
    .withIndex("by_a_port", (q) => q.eq("aPortId", portId))
    .first()) ??
  (await ctx.db
    .query("cables")
    .withIndex("by_b_port", (q) => q.eq("bPortId", portId))
    .first());

/**
 * Deletes a device's ports and cables, as it leaves the inventory, and
 * returns them so the deletion can be undone.
 */
export const deleteDeviceCabling = async (
  ctx: MutationCtx,
  deviceId: string,
  /** Hand back its source's cables too, as manual: the source dropped them. */
  { keepSourced = false }: { keepSourced?: boolean } = {},
): Promise<{ ports: Array<NewPort>; cables: Array<NewCable> }> => {
  const [ports, cables] = await Promise.all([
    portRowsOf(ctx, deviceId),
    cableRowsOf(ctx, deviceId),
  ]);
  for (const row of [...cables, ...ports]) await ctx.db.delete(row._id);
  return {
    ports: ports.map((row) => {
      const { source: _, ...value } = toPort(row);
      return value;
    }),
    // A source's cable comes back with its next sync, not as a manual one.
    cables: cables
      .filter((row) => keepSourced || row.source === undefined)
      .map((row) => {
        const { source: _, ...value } = toCable(row);
        return value;
      }),
  };
};

/**
 * Gives a new inventory device its ports, and lays the cables that plug into
 * them, under the rules the map's `device.create` applies.
 */
export const insertDeviceCabling = async (
  ctx: MutationCtx,
  device: { siteId: string; objectId: string; type: DeviceType },
  given: { ports?: Array<NewPort>; cables?: Array<NewCable> },
  updatedBy: string,
) => {
  const ports = portsForNewDevice(device.objectId, device.type, given.ports);
  const cables = given.cables ?? [];
  if (
    portListError(device.objectId, ports) ||
    cables.length > MAX_PORTS_PER_DEVICE
  ) {
    throw new ConvexError("Les ports de cet équipement sont invalides.");
  }
  const own = new Set(ports.map((value) => value.id));
  for (const id of own) {
    const taken = await ctx.db
      .query("ports")
      .withIndex("by_object_id", (q) => q.eq("objectId", id))
      .first();
    if (taken) {
      throw new ConvexError("Les ports de cet équipement sont invalides.");
    }
  }
  const farPorts = new Map<string, Doc<"ports">>();
  const cabled = new Set<string>();
  const existing = new Set<string>();
  for (const value of cables) {
    for (const end of [value.a, value.b]) {
      if (own.has(end.portId) || farPorts.has(end.portId)) continue;
      const row = await ctx.db
        .query("ports")
        .withIndex("by_object_id", (q) => q.eq("objectId", end.portId))
        .unique();
      if (row?.siteId !== device.siteId) continue;
      farPorts.set(end.portId, row);
      if (await cableRowAt(ctx, end.portId)) cabled.add(end.portId);
    }
    const cable = await ctx.db
      .query("cables")
      .withIndex("by_object_id", (q) => q.eq("objectId", value.id))
      .unique();
    if (cable) existing.add(value.id);
  }
  const result = cablesToLay(device.objectId, own, cables, {
    farPortOf: (end) => farPorts.get(end.portId),
    isCabled: (portId) => cabled.has(portId),
    cableExists: (cableId) => existing.has(cableId),
  });
  if ("error" in result) {
    throw new ConvexError("Les câbles de cet équipement sont invalides.");
  }
  const now = Date.now();
  for (const value of ports) {
    await ctx.db.insert(
      "ports",
      await observedPort(ctx, portRow(device.siteId, value)),
    );
  }
  for (const value of result.cables) {
    await ctx.db.insert(
      "cables",
      cableRow(device.siteId, value, now, updatedBy),
    );
  }
};

export const portRowOf = async (ctx: QueryCtx, portId: string) =>
  await ctx.db
    .query("ports")
    .withIndex("by_object_id", (q) => q.eq("objectId", portId))
    .unique();

const traced = (row: Doc<"ports"> | null) =>
  row ? { ...row, id: row.objectId } : undefined;

/** The ports a cable from `start` leads through, the last where it ends. */
export const traceRows = async (ctx: QueryCtx, start: Doc<"ports">) =>
  await traceFrom(
    { ...start, id: start.objectId },
    {
      cabledTo: async (portId) => {
        const cable = await cableRowAt(ctx, portId);
        if (!cable) return undefined;
        return traced(
          await portRowOf(
            ctx,
            cable.aPortId === portId ? cable.bPortId : cable.aPortId,
          ),
        );
      },
      portOf: async (portId) => traced(await portRowOf(ctx, portId)),
      frontsOf: async (rearPortId) =>
        (
          await ctx.db
            .query("ports")
            .withIndex("by_rear_port", (q) => q.eq("rearPortId", rearPortId))
            .take(2)
        ).map((row) => ({ ...row, id: row.objectId })),
      isSocket: async (deviceId) =>
        (
          await ctx.db
            .query("devices")
            .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
            .unique()
        )?.type === "wall-port",
    },
  );
