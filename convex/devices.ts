import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { editorMutation, readerQuery } from "./lib/functions";
import { placedDevicesOf } from "./mapDocument";
import {
  deviceIdentityFields,
  deviceMetadata,
  deviceSource,
  deviceType,
  newCable,
  newPort,
  placedDevice,
} from "./mapValidators";
import { deleteDeviceCabling, insertDeviceCabling } from "./lib/ports";
import { observedMetadata } from "./lib/statuses";
import { recordArrival } from "./history";
import { lastSighting, lastSightingOf } from "./cables";
import { requireOpenSite, requireSite } from "./sites";
import {
  IDENTITY_FIELD_NAMES,
  identityEditError,
  isAbsentFromSource,
  isDeletable,
  restoredSource,
  isSourceOwned,
  namedAfterHostname,
  normalizeIdentityEdit,
} from "../src/devices/identity";
import type { IdentityEdit } from "../src/devices/identity";
import { INTEGRATION_LABELS } from "../src/sites/integrations";
import { withPlacementClock } from "../src/sites/netboxImport";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export const listForFloor = readerQuery({
  args: { floorId: v.string() },
  returns: v.array(placedDevice),
  handler: async (ctx, { floorId }) => await placedDevicesOf(ctx, floorId),
});

// `null` removes an optional field; an absent key leaves it as it is.
const optionalText = v.optional(v.union(v.string(), v.null()));

export const identityEdit = v.object({
  name: v.optional(v.string()),
  hostname: optionalText,
  serial: optionalText,
  macs: v.optional(v.array(v.string())),
  model: optionalText,
  ip: optionalText,
  notes: optionalText,
});

const inventoryDevice = v.object({
  id: v.string(),
  ...deviceIdentityFields,
  source: v.optional(deviceSource),
  metadata: deviceMetadata,
  /** When the network last saw one of its MACs (A71), whatever its status. */
  seenAt: v.optional(v.number()),
  /** Where it stands, or `null` for a device on no floor. */
  location: v.union(
    v.null(),
    v.object({
      buildingId: v.string(),
      buildingName: v.string(),
      floorId: v.string(),
      floorName: v.string(),
    }),
  ),
});

/** Every device of a site, placed or not, as the inventory lists them. */
export const listForSite = readerQuery({
  args: { siteId: v.string() },
  returns: v.array(inventoryDevice),
  handler: async (ctx, { siteId }) => {
    const [rows, floorNames, sightings] = await Promise.all([
      ctx.db
        .query("devices")
        .withIndex("by_site", (q) => q.eq("siteId", siteId))
        .collect(),
      siteFloorNames(ctx, siteId),
      // One read of the site's sightings rather than one per MAC: the list
      // holds every device.
      ctx.db
        .query("macSightings")
        .withIndex("by_site_mac", (q) => q.eq("siteId", siteId))
        .collect(),
    ]);
    const seenAtOf = new Map(sightings.map(({ mac, seenAt }) => [mac, seenAt]));
    return rows.map((row) => {
      const floor = row.placement && floorNames.get(row.placement.floorId);
      const seenAt = Math.max(
        0,
        ...row.macs.map((mac) => seenAtOf.get(mac) ?? 0),
      );
      return {
        id: row.objectId,
        type: row.type,
        name: row.name,
        hostname: row.hostname,
        serial: row.serial,
        macs: row.macs,
        model: row.model,
        ip: row.ip,
        notes: row.notes,
        source: row.source,
        metadata: row.metadata,
        ...(seenAt > 0 && { seenAt }),
        location:
          row.placement && floor
            ? { floorId: row.placement.floorId, ...floor }
            : null,
      };
    });
  },
});

/**
 * Where and when the network last saw a device, by its MAC addresses, for
 * every role (ADR 0032): the place and the time, not the history.
 */
export const lastSeen = readerQuery({
  args: { deviceId: v.string() },
  returns: lastSighting,
  handler: async (ctx, { deviceId }) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
      .unique();
    return device ? await lastSightingOf(ctx, device) : null;
  },
});

/**
 * The floor a device of the site stands on, so a link that names only the
 * device opens it there (ADR 0030); null when it is on no floor or not the
 * site's.
 */
export const floorOf = readerQuery({
  args: { siteId: v.string(), deviceId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { siteId, deviceId }) => {
    const device = await getDevice(ctx, deviceId);
    if (device?.siteId !== siteId) return null;
    return device.placement?.floorId ?? null;
  },
});

/**
 * How many of the site's devices stand on no floor, so the map can say it
 * does not show the whole site.
 */
export const unplacedCount = readerQuery({
  args: { siteId: v.string() },
  returns: v.number(),
  handler: async (ctx, { siteId }) => {
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    return rows.filter((row) => !row.placement).length;
  },
});

async function siteFloorNames(ctx: QueryCtx, siteId: string) {
  const buildings = await ctx.db
    .query("buildings")
    .withIndex("by_site", (q) => q.eq("siteId", siteId))
    .collect();
  const names = new Map<
    string,
    { buildingId: string; buildingName: string; floorName: string }
  >();
  for (const building of buildings) {
    const floors = await ctx.db
      .query("floors")
      .withIndex("by_building", (q) => q.eq("buildingId", building.objectId))
      .collect();
    for (const floor of floors) {
      names.set(floor.objectId, {
        buildingId: building.objectId,
        buildingName: building.name,
        floorName: floor.name,
      });
    }
  }
  return names;
}

const getDevice = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
    .unique();

const DEVICE_ID = /^device:[\w:.-]{1,120}$/;

/** What `remove` hands back, so `create` can bring the device back whole. */
const removedDevice = {
  type: deviceType,
  identity: identityEdit,
  /** Status and the like, which no form edits. */
  metadata: v.optional(deviceMetadata),
  /** Absent for a new device, which gets its type's ports. */
  ports: v.optional(v.array(newPort)),
  cables: v.optional(v.array(newCable)),
  /**
   * Only for a device NetBox no longer returns, which the "Annuler" of its
   * deletion brings back absent (ADR 0039).
   */
  source: v.optional(deviceSource),
};

/**
 * Adds a manual device to a site's inventory, on no floor. The client names
 * it, so a retry or the "Annuler" of a deletion brings back the same device.
 */
export const create = editorMutation({
  args: { siteId: v.string(), deviceId: v.string(), ...removedDevice },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireOpenSite(ctx, args.siteId);
    await insertManualDevice(ctx, args, ctx.user.id);
    return null;
  },
});

/** Validates and inserts a manual device, on no floor, with its cabling. */
export async function insertManualDevice(
  ctx: MutationCtx,
  {
    siteId,
    deviceId,
    type,
    identity,
    metadata,
    ports,
    cables,
    source,
  }: {
    siteId: string;
    deviceId: string;
    type: Doc<"devices">["type"];
    identity: IdentityEdit;
    metadata?: Doc<"devices">["metadata"];
    source?: Doc<"devices">["source"];
    ports?: Array<Infer<typeof newPort>>;
    cables?: Array<Infer<typeof newCable>>;
  },
  userId: string,
) {
  await requireSite(ctx, siteId);
  if (!DEVICE_ID.test(deviceId)) throw new ConvexError("Invalid device id");
  if (await getDevice(ctx, deviceId)) {
    throw new ConvexError("Cet identifiant d'équipement est déjà pris.");
  }

  const restored = restoredSource(source);
  if ("error" in restored) throw new ConvexError(restored.error);
  const edit = namedAfterHostname(normalizeIdentityEdit(identity), { source });
  if (!edit.name) throw new ConvexError("Le nom est obligatoire.");
  const error = identityEditError(edit);
  if (error) throw new ConvexError(error);

  const macs = edit.macs ?? [];
  await replaceDeviceMacs(ctx, { siteId, objectId: deviceId }, macs);
  const device = { siteId, objectId: deviceId, type, macs };
  await ctx.db.insert("devices", {
    objectId: deviceId,
    siteId,
    type,
    name: edit.name,
    hostname: edit.hostname ?? undefined,
    serial: edit.serial ?? undefined,
    macs,
    model: edit.model ?? undefined,
    ip: edit.ip ?? undefined,
    notes: edit.notes ?? undefined,
    // Brought back on no floor: its 30 days start again now (ADR 0039).
    ...(restored.source && {
      source: withPlacementClock(restored.source, false, Date.now()),
    }),
    metadata: await observedMetadata(ctx, device, metadata ?? {}),
    updatedAt: Date.now(),
    updatedBy: userId,
  });
  await recordArrival(ctx, deviceId, Date.now());
  await insertDeviceCabling(
    ctx,
    { siteId, objectId: deviceId, type },
    { ports, cables },
    userId,
  );
}

/**
 * Deletes a manual device that is on no floor, or one NetBox no longer
 * returns (ADR 0039). A placed one is deleted from the map, where undo
 * restores its cables; one its source still returns only leaves the map.
 * Returns what `create` needs to undo it, or `null` if it was already gone.
 */
export const remove = editorMutation({
  args: { deviceId: v.string() },
  returns: v.union(v.null(), v.object(removedDevice)),
  handler: async (ctx, { deviceId }) => {
    const device = await getDevice(ctx, deviceId);
    if (!device) return null;
    await requireOpenSite(ctx, device.siteId);
    if (device.source && !isDeletable(device)) {
      throw new ConvexError(
        `Cet équipement vient de ${INTEGRATION_LABELS[device.source.integration]} : il ne se supprime pas dans NetPlan.`,
      );
    }
    if (device.placement) {
      throw new ConvexError(
        "Cet équipement est sur le plan : supprimez-le depuis le plan.",
      );
    }
    const macs = await ctx.db
      .query("deviceMacs")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .collect();
    for (const row of macs) await ctx.db.delete(row._id);
    // NetBox no longer lists an absent device's cables (ADR 0039).
    const cabling = await deleteDeviceCabling(ctx, deviceId, {
      keepSourced: isAbsentFromSource(device.source),
    });
    await ctx.db.delete(device._id);
    return {
      ...cabling,
      type: device.type,
      identity: {
        name: device.name,
        hostname: device.hostname ?? null,
        serial: device.serial ?? null,
        macs: device.macs,
        model: device.model ?? null,
        ip: device.ip ?? null,
        notes: device.notes ?? null,
      },
      metadata: device.metadata,
      ...(device.source && { source: device.source }),
    };
  },
});

type EditedField = keyof IdentityEdit;
type IdentityPatch = Partial<Pick<Doc<"devices">, EditedField>>;

/**
 * Changes a device's identity, outside the map's history (ADR 0022). Fields
 * its source owns are refused only when the edit would change them, so a
 * value read from the device can be sent back as it is.
 */
export const updateIdentity = editorMutation({
  args: { deviceId: v.string(), edit: identityEdit },
  returns: v.null(),
  handler: async (ctx, { deviceId, edit: rawEdit }) => {
    const device = await getDevice(ctx, deviceId);
    if (!device) throw new ConvexError("Cet équipement n'existe plus.");
    await requireOpenSite(ctx, device.siteId);

    const edit = namedAfterHostname(normalizeIdentityEdit(rawEdit), device);
    const error = identityEditError(edit);
    if (error) throw new ConvexError(error);

    const patch: IdentityPatch = {};
    for (const field of Object.keys(edit) as Array<EditedField>) {
      const value = edit[field];
      if (value === undefined) continue;
      const next = value ?? undefined;
      if (JSON.stringify(device[field]) === JSON.stringify(next)) continue;
      if (device.source && isSourceOwned(device.source, field)) {
        throw new ConvexError(
          `Le champ « ${IDENTITY_FIELD_NAMES[field]} » vient de ${INTEGRATION_LABELS[device.source.integration]} et ne se modifie pas dans NetPlan.`,
        );
      }
      Object.assign(patch, { [field]: next });
    }
    if (Object.keys(patch).length === 0) return null;

    if (patch.macs) await replaceDeviceMacs(ctx, device, patch.macs);
    await ctx.db.patch(device._id, {
      ...patch,
      updatedAt: Date.now(),
      updatedBy: ctx.user.id,
    });
    return null;
  },
});

/** Claims the device's new MAC addresses and frees the ones it dropped. */
async function replaceDeviceMacs(
  ctx: MutationCtx,
  device: Pick<Doc<"devices">, "siteId" | "objectId">,
  macs: Array<string>,
) {
  for (const mac of macs) {
    const owner = await ctx.db
      .query("deviceMacs")
      .withIndex("by_site_mac", (q) =>
        q.eq("siteId", device.siteId).eq("mac", mac),
      )
      .unique();
    if (!owner || owner.deviceId === device.objectId) continue;
    const other = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", owner.deviceId))
      .unique();
    throw new ConvexError(
      `L'adresse MAC ${mac} est déjà celle de ${other?.name ?? "un autre équipement"}.`,
    );
  }

  const current = await ctx.db
    .query("deviceMacs")
    .withIndex("by_device", (q) => q.eq("deviceId", device.objectId))
    .collect();
  const kept = new Set(macs);
  for (const row of current) {
    if (!kept.has(row.mac)) await ctx.db.delete(row._id);
  }
  const held = new Set(current.map((row) => row.mac));
  for (const mac of macs) {
    if (held.has(mac)) continue;
    await ctx.db.insert("deviceMacs", {
      siteId: device.siteId,
      mac,
      deviceId: device.objectId,
    });
  }
}
