import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { nextNetBoxAttempt, nextNominalAttempt } from "./integrationSchedule";

const libreNmsDevice = v.object({
  externalId: v.string(),
  hostname: v.string(),
  networkName: v.string(),
  role: v.union(v.literal("access"), v.literal("core")),
  localizationTarget: v.boolean(),
});

const siteConfiguration = {
  objectId: v.string(),
  configKey: v.string(),
  displayName: v.string(),
  timezone: v.string(),
  enabled: v.boolean(),
  dayStartMinute: v.number(),
  dayEndMinute: v.number(),
  netboxInstanceKey: v.string(),
  netboxExternalSiteId: v.string(),
  netboxExternalSiteSlug: v.string(),
  libreNmsInstanceKey: v.string(),
  libreNmsDevices: v.array(libreNmsDevice),
};

const siteInput = v.object(siteConfiguration);
type SiteInput = Infer<typeof siteInput>;
const siteOutput = v.object({
  id: v.string(),
  ...siteConfiguration,
  configVersion: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export type SiteConfiguration = Omit<Doc<"sites">, "_id" | "_creationTime">;

export const DEFAULT_SITE = {
  objectId: "site:arles",
  configKey: "arles",
  displayName: "Arles",
  timezone: "Europe/Paris",
  enabled: true,
  dayStartMinute: 7 * 60,
  dayEndMinute: 20 * 60,
  netboxInstanceKey: "netbox-main",
  netboxExternalSiteId: "1",
  netboxExternalSiteSlug: "arles",
  libreNmsInstanceKey: "librenms-main",
  libreNmsDevices: [
    {
      externalId: "4",
      hostname: "access01-tnzpv-arles.cust.as49028.net",
      networkName: "sw-access-01.as49028.net",
      role: "access" as const,
      localizationTarget: true,
    },
    {
      externalId: "5",
      hostname: "access02-tnzpv-arles.cust.as49028.net",
      networkName: "sw-access-02.as49028.net",
      role: "access" as const,
      localizationTarget: true,
    },
    {
      externalId: "2",
      hostname: "core01-tnzpv-arles.cust.as49028.net",
      networkName: "sw-core-01",
      role: "core" as const,
      localizationTarget: false,
    },
    {
      externalId: "3",
      hostname: "core02-tnzpv-arles.cust.as49028.net",
      networkName: "sw-core-02",
      role: "core" as const,
      localizationTarget: false,
    },
  ],
} satisfies SiteInput;

const toSite = (site: Doc<"sites">) => ({
  id: site.objectId,
  objectId: site.objectId,
  configKey: site.configKey,
  displayName: site.displayName,
  timezone: site.timezone,
  enabled: site.enabled,
  dayStartMinute: site.dayStartMinute,
  dayEndMinute: site.dayEndMinute,
  netboxInstanceKey: site.netboxInstanceKey,
  netboxExternalSiteId: site.netboxExternalSiteId,
  netboxExternalSiteSlug: site.netboxExternalSiteSlug,
  libreNmsInstanceKey: site.libreNmsInstanceKey,
  libreNmsDevices: site.libreNmsDevices,
  configVersion: site.configVersion,
  createdAt: site.createdAt,
  updatedAt: site.updatedAt,
});

const configurationFromSite = (site: Doc<"sites">): SiteInput => ({
  objectId: site.objectId,
  configKey: site.configKey,
  displayName: site.displayName,
  timezone: site.timezone,
  enabled: site.enabled,
  dayStartMinute: site.dayStartMinute,
  dayEndMinute: site.dayEndMinute,
  netboxInstanceKey: site.netboxInstanceKey,
  netboxExternalSiteId: site.netboxExternalSiteId,
  netboxExternalSiteSlug: site.netboxExternalSiteSlug,
  libreNmsInstanceKey: site.libreNmsInstanceKey,
  libreNmsDevices: site.libreNmsDevices,
});

const sameConfiguration = (left: SiteInput, right: SiteInput): boolean =>
  left.objectId === right.objectId &&
  left.configKey === right.configKey &&
  left.displayName === right.displayName &&
  left.timezone === right.timezone &&
  left.enabled === right.enabled &&
  left.dayStartMinute === right.dayStartMinute &&
  left.dayEndMinute === right.dayEndMinute &&
  left.netboxInstanceKey === right.netboxInstanceKey &&
  left.netboxExternalSiteId === right.netboxExternalSiteId &&
  left.netboxExternalSiteSlug === right.netboxExternalSiteSlug &&
  left.libreNmsInstanceKey === right.libreNmsInstanceKey &&
  left.libreNmsDevices.length === right.libreNmsDevices.length &&
  left.libreNmsDevices.every((device, index) => {
    const other = right.libreNmsDevices[index];
    return (
      device.externalId === other.externalId &&
      device.hostname === other.hostname &&
      device.networkName === other.networkName &&
      device.role === other.role &&
      device.localizationTarget === other.localizationTarget
    );
  });

const validateConfiguration = (input: SiteInput) => {
  if (!input.objectId.trim() || !input.configKey.trim()) {
    throw new ConvexError("Site identity is required");
  }
  if (
    input.dayStartMinute < 0 ||
    input.dayEndMinute >= 24 * 60 ||
    !Number.isInteger(input.dayStartMinute) ||
    !Number.isInteger(input.dayEndMinute) ||
    input.dayStartMinute >= input.dayEndMinute
  ) {
    throw new ConvexError("Invalid site schedule");
  }
  const deviceIds = new Set<string>();
  for (const device of input.libreNmsDevices) {
    if (deviceIds.has(device.externalId)) {
      throw new ConvexError("Duplicate LibreNMS device identity");
    }
    if (!/^[1-9]\d*$/.test(device.externalId)) {
      throw new ConvexError("LibreNMS device ID must be a canonical number");
    }
    deviceIds.add(device.externalId);
    if (device.localizationTarget && device.role !== "access") {
      throw new ConvexError("Only access switches can target localization");
    }
  }
};

const getByObjectId = async (ctx: MutationCtx, objectId: string) =>
  await ctx.db
    .query("sites")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

export const requireSite = async (ctx: MutationCtx, siteId: string) => {
  const site = await getByObjectId(ctx, siteId);
  if (!site) throw new ConvexError("Site not found");
  return site;
};

const insertSite = async (
  ctx: MutationCtx,
  input: SiteInput,
): Promise<string> => {
  validateConfiguration(input);
  const [sameObjectId, sameConfigKey, sameNetBoxSite] = await Promise.all([
    getByObjectId(ctx, input.objectId),
    ctx.db
      .query("sites")
      .withIndex("by_config_key", (q) => q.eq("configKey", input.configKey))
      .unique(),
    ctx.db
      .query("sites")
      .withIndex("by_netbox_site", (q) =>
        q
          .eq("netboxInstanceKey", input.netboxInstanceKey)
          .eq("netboxExternalSiteId", input.netboxExternalSiteId),
      )
      .unique(),
  ]);
  if (sameObjectId) {
    if (!sameConfiguration(configurationFromSite(sameObjectId), input)) {
      throw new ConvexError("Site object identity has different configuration");
    }
    return sameObjectId.objectId;
  }
  if (sameConfigKey || sameNetBoxSite) {
    throw new ConvexError("Site configuration identity already exists");
  }
  const now = Date.now();
  await ctx.db.insert("sites", {
    ...input,
    configVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  for (const workflow of ["netbox", "localization"] as const) {
    await ctx.db.insert("integrationWorkflowStates", {
      siteId: input.objectId,
      workflow,
      status: input.enabled ? "idle" : "disabled",
      fenceCounter: 0,
      recentConfirmationMs: 2 * 60 * 1000,
      backoffLevel: 0,
      consecutiveFailures: 0,
      timeoutMs: 2 * 60 * 1000,
      switchProgress: [],
      nextScheduledAt:
        workflow === "netbox"
          ? nextNetBoxAttempt(now)
          : nextNominalAttempt(now, input),
      configVersion: 1,
    });
  }
  return input.objectId;
};

export const list = query({
  args: {},
  returns: v.array(siteOutput),
  handler: async (ctx) => {
    const sites = await ctx.db.query("sites").collect();
    return sites
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"))
      .map(toSite);
  },
});

export const get = query({
  args: { siteId: v.string() },
  returns: v.union(v.null(), siteOutput),
  handler: async (ctx, { siteId }) => {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", siteId))
      .unique();
    return site ? toSite(site) : null;
  },
});

export const getForFloor = query({
  args: { floorId: v.string() },
  returns: v.union(v.null(), siteOutput),
  handler: async (ctx, { floorId }) => {
    const floor = await ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) => q.eq("objectId", floorId))
      .unique();
    if (!floor) return null;
    const building = await ctx.db
      .query("buildings")
      .withIndex("by_object_id", (q) => q.eq("objectId", floor.buildingId))
      .unique();
    if (!building) return null;
    const site = await ctx.db
      .query("sites")
      .withIndex("by_object_id", (q) => q.eq("objectId", building.siteId))
      .unique();
    return site ? toSite(site) : null;
  },
});

export const create = internalMutation({
  args: { site: siteInput },
  returns: v.string(),
  handler: async (ctx, { site }) => await insertSite(ctx, site),
});

export const ensureDefault = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await insertSite(ctx, DEFAULT_SITE),
});

export const setEnabled = internalMutation({
  args: { siteId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { siteId, enabled }) => {
    const site = await requireSite(ctx, siteId);
    const now = Date.now();
    const configVersion = site.configVersion + 1;
    const states = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) => q.eq("siteId", siteId))
      .collect();
    for (const state of states) {
      if (state.activeAttemptId) {
        const attempt = await ctx.db
          .query("integrationAttempts")
          .withIndex("by_site_workflow_attempt", (q) =>
            q
              .eq("siteId", siteId)
              .eq("workflow", state.workflow)
              .eq("attemptId", state.activeAttemptId as string),
          )
          .unique();
        if (attempt?.status === "running") {
          await ctx.db.patch(attempt._id, {
            status: "abandoned",
            completedAt: now,
          });
        }
      }
      await ctx.db.patch(state._id, {
        status: enabled
          ? state.lastPublishedId
            ? "success"
            : "idle"
          : "disabled",
        activeAttemptId: undefined,
        activeOrigin: undefined,
        nextScheduledAt: enabled
          ? state.workflow === "netbox"
            ? nextNetBoxAttempt(now)
            : nextNominalAttempt(now, site)
          : state.nextScheduledAt,
        configVersion,
      });
    }
    await ctx.db.patch(site._id, {
      enabled,
      configVersion,
      updatedAt: now,
    });
    return null;
  },
});

export const remove = internalMutation({
  args: { siteId: v.string() },
  returns: v.null(),
  handler: async (ctx, { siteId }) => {
    const site = await requireSite(ctx, siteId);
    const workflowStates = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) => q.eq("siteId", siteId))
      .collect();
    const ownedRows = await Promise.all([
      ctx.db
        .query("buildings")
        .withIndex("by_site", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("integrationAttempts")
        .withIndex("by_site_workflow_started", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("netboxGenerations")
        .withIndex("by_site_published", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("netboxInventory")
        .withIndex("by_generation", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("netboxConnections")
        .withIndex("by_generation", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("localizationSnapshots")
        .withIndex("by_site_published", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("localizationObservations")
        .withIndex("by_snapshot", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("localizationLinks")
        .withIndex("by_snapshot", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("switchRefreshStates")
        .withIndex("by_site_switch", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("computerLocations")
        .withIndex("by_site_computer", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("localizationCycles")
        .withIndex("by_site_completed", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("localizationEvents")
        .withIndex("by_site_cycle", (q) => q.eq("siteId", siteId))
        .first(),
      ctx.db
        .query("externalObjectBindings")
        .withIndex("by_external", (q) => q.eq("siteId", siteId))
        .first(),
    ]);
    if (ownedRows.some(Boolean)) {
      throw new ConvexError("Site still owns durable data");
    }
    for (const state of workflowStates) await ctx.db.delete(state._id);
    await ctx.db.delete(site._id);
    return null;
  },
});
