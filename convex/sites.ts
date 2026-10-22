import { ConvexError, v } from "convex/values";
import { cycleOf, deleteCycle, rescheduleCycle } from "./lib/cycles";
import { deleteDeviceMacs } from "./lib/deviceMacs";
import { deleteIgnoredMacs } from "./lib/ignoredMacs";
import { deleteDeviceCabling } from "./lib/ports";
import { deleteSightings } from "./librenmsCycle";
import { deleteImportReviews } from "./netboxImport";
import { deletePushes } from "./netboxPush";
import { adminMutation, adminQuery, readerQuery } from "./lib/functions";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { integrationKind, siteCadence } from "./siteValidators";
import {
  DEFAULT_CADENCE,
  SITE_NAME_TAKEN,
  siteSettingsError,
} from "../src/sites/settings";
import type { SiteSettings } from "../src/sites/settings";

const siteSummary = v.object({
  id: v.string(),
  name: v.string(),
  timezone: v.string(),
  /** Read only and out of the picker (ADR 0033). */
  archived: v.boolean(),
});

const siteSettings = v.object({
  id: v.string(),
  name: v.string(),
  timezone: v.string(),
  archived: v.boolean(),
  archivedAt: v.union(v.null(), v.number()),
  cadence: siteCadence,
  automaticRefresh: v.boolean(),
  manualRefresh: v.boolean(),
  buildingCount: v.number(),
});

const siteListing = v.object({
  ...siteSettings.fields,
  floorCount: v.number(),
  /** The connected tools, NetBox first, and whether each is collected. */
  integrations: v.array(
    v.object({
      kind: integrationKind,
      enabled: v.boolean(),
    }),
  ),
});

const toSummary = (site: Doc<"sites">) => ({
  id: site.objectId,
  name: site.name,
  timezone: site.timezone,
  archived: site.archivedAt !== undefined,
});

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "fr");

const getByObjectId = async (ctx: QueryCtx, objectId: string) =>
  await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

const countBuildings = async (ctx: QueryCtx, siteId: string) =>
  (
    await ctx.db
      .query("buildings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect()
  ).length;

const toSettings = async (ctx: QueryCtx, site: Doc<"sites">) => ({
  ...toSummary(site),
  archivedAt: site.archivedAt ?? null,
  cadence: site.cadence,
  automaticRefresh: site.automaticRefresh,
  manualRefresh: site.manualRefresh,
  buildingCount: await countBuildings(ctx, site.objectId),
});

export const requireSite = async (ctx: QueryCtx, siteId: string) => {
  const site = await getByObjectId(ctx, siteId);
  if (!site) throw new ConvexError("Ce site n'existe plus.");
  return site;
};

export const ARCHIVED_SITE = "Ce site est archivé : il est en lecture seule.";

/**
 * The site, for a change to its plan, inventory or collection: an archived
 * site refuses every one (ADR 0033). Its admin settings stay editable.
 */
export const requireOpenSite = async (ctx: QueryCtx, siteId: string) => {
  const site = await requireSite(ctx, siteId);
  if (site.archivedAt !== undefined) throw new ConvexError(ARCHIVED_SITE);
  return site;
};

/** Refuses a change to anything of an archived site, through its building. */
export const requireOpenBuilding = async (
  ctx: QueryCtx,
  buildingId: string,
) => {
  const building = await ctx.db
    .query("buildings")
    .withIndex("by_object_id", (q) => q.eq("objectId", buildingId))
    .unique();
  if (building) await requireOpenSite(ctx, building.siteId);
};

// Two sites with one name would be the same entry in the site picker.
const assertNameFree = async (
  ctx: QueryCtx,
  name: string,
  exceptObjectId?: string,
) => {
  const key = name.trim().toLocaleLowerCase("fr");
  const sites = await ctx.db.query("sites").collect();
  if (
    sites.some(
      (site) =>
        site.objectId !== exceptObjectId &&
        site.name.toLocaleLowerCase("fr") === key,
    )
  ) {
    throw new ConvexError(SITE_NAME_TAKEN);
  }
};

const assertSettings = (settings: SiteSettings) => {
  const error = siteSettingsError(settings);
  if (error) throw new ConvexError(error);
};

/** Creates a site with the default cadence, refusing invalid settings. */
export const insertSite = async (
  ctx: MutationCtx,
  input: { objectId: string; name: string; timezone: string },
): Promise<string> => {
  const settings: SiteSettings = {
    name: input.name.trim(),
    timezone: input.timezone,
    cadence: DEFAULT_CADENCE,
    automaticRefresh: true,
    manualRefresh: true,
  };
  assertSettings(settings);
  if (await getByObjectId(ctx, input.objectId)) {
    throw new ConvexError("Cet identifiant de site est déjà pris.");
  }
  await assertNameFree(ctx, settings.name);
  const now = Date.now();
  await ctx.db.insert("sites", {
    objectId: input.objectId,
    ...settings,
    createdAt: now,
    updatedAt: now,
  });
  return input.objectId;
};

/** Every site, for the site picker. */
export const list = readerQuery({
  args: {},
  returns: v.array(siteSummary),
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    return sites.map(toSummary).sort(byName);
  },
});

/**
 * Every site with its buildings, floors and tools, for the sites page. No
 * device count: it would read every device and rerun at each move.
 */
export const listSettings = adminQuery({
  args: {},
  returns: v.array(siteListing),
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    const listed = await Promise.all(
      sites.map(async (site) => {
        const siteId = site.objectId;
        const buildings = await ctx.db
          .query("buildings")
          .withIndex("by_site", (q) => q.eq("siteId", siteId))
          .collect();
        let floorCount = 0;
        for (const building of buildings) {
          floorCount += (
            await ctx.db
              .query("floors")
              .withIndex("by_building", (q) =>
                q.eq("buildingId", building.objectId),
              )
              .collect()
          ).length;
        }
        const integrations = (
          await ctx.db
            .query("integrations")
            .withIndex("by_site_kind", (q) => q.eq("siteId", siteId))
            .collect()
        )
          .map((row) => ({ kind: row.kind, enabled: row.enabled }))
          .sort((a, b) =>
            a.kind === "netbox" ? -1 : b.kind === "netbox" ? 1 : 0,
          );
        return {
          ...(await toSettings(ctx, site)),
          floorCount,
          integrations,
        };
      }),
    );
    return listed.sort(byName);
  },
});

export const getSettings = adminQuery({
  args: { siteId: v.string() },
  returns: v.union(v.null(), siteSettings),
  handler: async (ctx, { siteId }) => {
    const site = await getByObjectId(ctx, siteId);
    return site ? await toSettings(ctx, site) : null;
  },
});

/**
 * A site's buildings and floors with how many devices each floor shows, for
 * the admin, who removes them on the plan.
 */
export const structure = adminQuery({
  args: { siteId: v.string() },
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      floors: v.array(
        v.object({ id: v.string(), name: v.string(), devices: v.number() }),
      ),
    }),
  ),
  handler: async (ctx, { siteId }) => {
    const buildings = await ctx.db
      .query("buildings")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    const placed = new Map<string, number>();
    const devices = ctx.db
      .query("devices")
      .withIndex("by_site", (q) => q.eq("siteId", siteId));
    for await (const device of devices) {
      const floorId = device.placement?.floorId;
      if (floorId) placed.set(floorId, (placed.get(floorId) ?? 0) + 1);
    }
    return await Promise.all(
      buildings
        .toSorted((a, b) => a.order - b.order)
        .map(async (building) => ({
          id: building.objectId,
          name: building.name,
          floors: (
            await ctx.db
              .query("floors")
              .withIndex("by_building", (q) =>
                q.eq("buildingId", building.objectId),
              )
              .collect()
          )
            .toSorted((a, b) => a.order - b.order)
            .map((floor) => ({
              id: floor.objectId,
              name: floor.name,
              devices: placed.get(floor.objectId) ?? 0,
            })),
        })),
    );
  },
});

export const create = adminMutation({
  args: { name: v.string(), timezone: v.string() },
  returns: v.string(),
  handler: async (ctx, { name, timezone }) =>
    await insertSite(ctx, {
      objectId: `site:${crypto.randomUUID()}`,
      name,
      timezone,
    }),
});

export const update = adminMutation({
  args: {
    siteId: v.string(),
    name: v.string(),
    timezone: v.string(),
    cadence: siteCadence,
    automaticRefresh: v.boolean(),
    manualRefresh: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { siteId, ...input }) => {
    const site = await requireSite(ctx, siteId);
    const settings: SiteSettings = {
      ...input,
      name: input.name.trim(),
      cadence: {
        ...input.cadence,
        businessDays: [...input.cadence.businessDays].sort((a, b) => a - b),
      },
    };
    assertSettings(settings);
    await assertNameFree(ctx, settings.name, siteId);
    await ctx.db.patch(site._id, { ...settings, updatedAt: Date.now() });
    await rescheduleCycle(ctx, { ...site, ...settings });
    return null;
  },
});

/**
 * Archives a site, or brings it back (C8, ADR 0033). Archived, it leaves the
 * picker, refuses every change to its plan and inventory, and is never
 * collected; nothing is deleted, so bringing it back is the same site.
 */
export const setArchived = adminMutation({
  args: { siteId: v.string(), archived: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { siteId, archived }) => {
    const site = await requireSite(ctx, siteId);
    if (archived === (site.archivedAt !== undefined)) return null;
    const now = Date.now();
    await ctx.db.patch(site._id, {
      archivedAt: archived ? now : undefined,
      updatedAt: now,
    });
    // A cycle or a push under way loses its lease, so nothing it brings back
    // is written; every writer checks the lease first.
    const cycle = archived ? await cycleOf(ctx, siteId) : null;
    if (cycle && (cycle.running || cycle.pushRunning)) {
      await ctx.db.patch(cycle._id, {
        running: undefined,
        pushRunning: undefined,
      });
    }
    // Back from the archive, a cycle long overdue starts within the minute.
    return null;
  },
});

// Removing a site never takes a plan with it: its buildings go first. Its
// integrations and its collection cycle go with it.
export const remove = adminMutation({
  args: { siteId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId }) => {
    const site = await requireSite(ctx, siteId);
    if ((await countBuildings(ctx, siteId)) > 0) {
      throw new ConvexError(
        "Ce site a encore des bâtiments : supprimez-les d'abord.",
      );
    }
    const integrations = await ctx.db
      .query("integrations")
      .withIndex("by_site_kind", (q) => q.eq("siteId", siteId))
      .collect();
    for (const integration of integrations) {
      await ctx.db.delete(integration._id);
    }
    await deleteCycle(ctx, siteId);
    await deleteImportReviews(ctx, siteId);
    await deletePushes(ctx, siteId);
    await deleteSightings(ctx, siteId);
    await deleteIgnoredMacs(ctx, siteId);
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    for (const device of devices) {
      await deleteDeviceMacs(ctx, device.objectId);
      await deleteDeviceCabling(ctx, device.objectId);
      await ctx.db.delete(device._id);
    }
    await ctx.db.delete(site._id);
    return null;
  },
});
