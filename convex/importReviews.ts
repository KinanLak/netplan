// The NetBox devices an import could not merge on its own (ADR 0022): an
// Éditeur settles a hostname suggestion, an admin a conflict. Settling binds
// at once, so the next import updates the device like any other; its ports
// and cables come with that import.
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { editorMutation, editorQuery } from "./lib/functions";
import { requireOpenSite } from "./sites";
import { hasRole } from "./lib/roles";
import { macRowsOf, sourceFields } from "./netboxImport";
import { importedDevice } from "./siteValidators";
import { MAX_MACS_PER_DEVICE } from "../src/devices/identity";

const deviceRow = async (ctx: QueryCtx, deviceId: string) =>
  await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", deviceId))
    .unique();

/**
 * Whether a device may still become the NetBox device of a review: a manual
 * one, or one NetBox no longer returns (ADR 0039).
 */
const reviewable = (device: Doc<"devices">) =>
  device.source === undefined || device.source.missingSince !== undefined;

/** The site's pending reviews, each with the devices it could be. */
export const listForSite = editorQuery({
  args: { siteId: v.string() },
  returns: v.array(
    v.object({
      kind: v.union(v.literal("suggestion"), v.literal("conflict")),
      device: importedDevice,
      candidates: v.array(
        v.object({ id: v.string(), name: v.string(), placed: v.boolean() }),
      ),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const rows = await ctx.db
      .query("importReviews")
      .withIndex("by_site", (q) =>
        q.eq("siteId", siteId).eq("integration", "netbox"),
      )
      .collect();
    return await Promise.all(
      rows.map(async (row) => {
        const devices = await Promise.all(
          row.candidateIds.map((id) => deviceRow(ctx, id)),
        );
        return {
          kind: row.kind,
          device: row.device,
          // A candidate bound since, or gone, is no longer a choice.
          candidates: devices.flatMap((device) =>
            device?.siteId === siteId && reviewable(device)
              ? [
                  {
                    id: device.objectId,
                    name: device.name,
                    placed: device.placement !== undefined,
                  },
                ]
              : [],
          ),
        };
      }),
    );
  },
});

/**
 * Settles a review: binds the NetBox device to one of its candidates, or,
 * with `deviceId: null`, keeps it apart as a new device.
 */
export const resolve = editorMutation({
  args: {
    siteId: v.string(),
    externalId: v.string(),
    deviceId: v.union(v.null(), v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { siteId, externalId, deviceId }) => {
    await requireOpenSite(ctx, siteId);
    const review = await ctx.db
      .query("importReviews")
      .withIndex("by_site", (q) =>
        q
          .eq("siteId", siteId)
          .eq("integration", "netbox")
          .eq("device.externalId", externalId),
      )
      .unique();
    if (!review) throw new ConvexError("Ce rapprochement est déjà traité.");
    if (review.kind === "conflict" && !hasRole(ctx.user.role, "admin")) {
      throw new ConvexError("Seul un administrateur tranche un conflit.");
    }
    const bound = await ctx.db
      .query("devices")
      .withIndex("by_site_source", (q) =>
        q
          .eq("siteId", siteId)
          .eq("source.integration", "netbox")
          .eq("source.externalId", externalId),
      )
      .collect();
    // A device of the NetBox used before may carry the same id.
    if (bound.some((device) => !device.source?.staleId)) {
      throw new ConvexError("Ce rapprochement est déjà traité.");
    }

    let target = null;
    if (deviceId !== null) {
      if (!review.candidateIds.includes(deviceId)) {
        throw new ConvexError("Cet équipement n'est pas proposé.");
      }
      target = await deviceRow(ctx, deviceId);
      if (target?.siteId !== siteId || !reviewable(target)) {
        throw new ConvexError("Cet équipement a changé : rechargez la page.");
      }
    }

    const now = Date.now();
    const id = target?.objectId ?? `device:${crypto.randomUUID()}`;
    const macs = await claimMacs(ctx, siteId, id, review.device.macs);
    const fields = sourceFields(review.device, macs, now);
    const stamp = { updatedAt: now, updatedBy: ctx.user.id };
    if (target) {
      await ctx.db.patch(target._id, { ...fields, ...stamp });
    } else {
      await ctx.db.insert("devices", {
        objectId: id,
        siteId,
        ...fields,
        metadata: {},
        ...stamp,
      });
    }
    await ctx.db.delete(review._id);
    return null;
  },
});

/**
 * Gives the device NetBox's MAC addresses and frees its others. One another
 * device holds stays with it until the next import settles it.
 */
const claimMacs = async (
  ctx: MutationCtx,
  siteId: string,
  deviceId: string,
  wanted: ReadonlyArray<string>,
) => {
  const macs: Array<string> = [];
  for (const mac of wanted.slice(0, MAX_MACS_PER_DEVICE)) {
    const owner = await ctx.db
      .query("deviceMacs")
      .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
      .first();
    if (owner && owner.deviceId !== deviceId) continue;
    if (!owner) await ctx.db.insert("deviceMacs", { siteId, mac, deviceId });
    macs.push(mac);
  }
  for (const row of await macRowsOf(ctx, deviceId)) {
    if (!macs.includes(row.mac)) await ctx.db.delete(row._id);
  }
  return macs;
};
