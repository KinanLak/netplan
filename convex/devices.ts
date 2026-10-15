import { ConvexError, v } from "convex/values";
import { editorMutation, readerQuery } from "./lib/functions";
import { placedDevicesOf } from "./mapDocument";
import { placedDevice } from "./mapValidators";
import {
  IDENTITY_FIELD_NAMES,
  identityEditError,
  isSourceOwned,
  normalizeIdentityEdit,
} from "../src/devices/identity";
import type { IdentityEdit } from "../src/devices/identity";
import { INTEGRATION_LABELS } from "../src/sites/integrations";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

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
    const device = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
      .unique();
    if (!device) throw new ConvexError("Cet équipement n'existe plus.");

    const edit = normalizeIdentityEdit(rawEdit);
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
          `Le champ « ${IDENTITY_FIELD_NAMES[field]} » vient de ${INTEGRATION_LABELS[device.source.integration]} et ne se modifie pas dans Netplan.`,
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
  device: Doc<"devices">,
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
