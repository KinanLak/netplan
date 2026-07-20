import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { connectionInput, inventoryInput } from "./netboxModel";
import {
  discoveredConnectionInput,
  observationInput,
  resolutionDiagnosticInput,
  switchResultInput,
} from "./librenmsModel";

declare const process: { env: Record<string, string | undefined> };

const PUBLIC_IMPORT_ERROR = "La synchronisation de l'intégration a échoué";

const safeEqual = (left: string, right: string): boolean => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
};

const requireConnectorSecret = (secret: string) => {
  const expectedSecret = process.env.NETPLAN_CONNECTOR_SECRET;
  if (!expectedSecret || !safeEqual(secret, expectedSecret)) {
    throw new ConvexError("Connecteur non autorisé");
  }
};

const importResult = v.object({
  joined: v.boolean(),
  siteId: v.string(),
  attemptId: v.string(),
  leaseId: v.string(),
  fence: v.number(),
  status: v.union(
    v.literal("running"),
    v.literal("success"),
    v.literal("error"),
    v.literal("abandoned"),
  ),
  leaseExpiresAt: v.number(),
  pinnedNetBoxGenerationId: v.optional(v.string()),
  publishedId: v.optional(v.string()),
  config: v.object({
    netboxInstanceKey: v.string(),
    netboxExternalSiteId: v.string(),
    netboxExternalSiteSlug: v.string(),
    libreNmsInstanceKey: v.string(),
    localizationTargetDeviceIds: v.array(v.string()),
    libreNmsSwitches: v.array(
      v.object({ externalId: v.string(), networkName: v.string() }),
    ),
  }),
});

type InventoryInput = Infer<typeof inventoryInput>;
type ConnectionInput = Infer<typeof connectionInput>;
type BeginMutationResult = {
  joined: boolean;
  attemptId: string;
  leaseId: string;
  fence: number;
  status: "running" | "success" | "error" | "abandoned";
  leaseExpiresAt: number;
  pinnedNetBoxGenerationId?: string;
  publishedId?: string;
};
type SiteConnectorConfig = {
  siteId: string;
  netboxInstanceKey: string;
  netboxExternalSiteId: string;
  netboxExternalSiteSlug: string;
  libreNmsInstanceKey: string;
  localizationTargetDeviceIds: Array<string>;
  libreNmsSwitches: Array<{ externalId: string; networkName: string }>;
};
type BeginImportResult = BeginMutationResult & {
  siteId: string;
  config: Omit<SiteConnectorConfig, "siteId">;
};
type NetBoxPublishResult = {
  generationId: string;
  inventoryCount: number;
  connectionCount: number;
};
type LocalizationPublishResult = {
  snapshotId: string;
  observationCount: number;
  linkCount: number;
};

export const getSiteByKey = internalQuery({
  args: { siteKey: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      siteId: v.string(),
      netboxInstanceKey: v.string(),
      netboxExternalSiteId: v.string(),
      netboxExternalSiteSlug: v.string(),
      libreNmsInstanceKey: v.string(),
      localizationTargetDeviceIds: v.array(v.string()),
      libreNmsSwitches: v.array(
        v.object({ externalId: v.string(), networkName: v.string() }),
      ),
    }),
  ),
  handler: async (ctx, { siteKey }) => {
    const site = await ctx.db
      .query("sites")
      .withIndex("by_config_key", (q) => q.eq("configKey", siteKey))
      .unique();
    return site
      ? {
          siteId: site.objectId,
          netboxInstanceKey: site.netboxInstanceKey,
          netboxExternalSiteId: site.netboxExternalSiteId,
          netboxExternalSiteSlug: site.netboxExternalSiteSlug,
          libreNmsInstanceKey: site.libreNmsInstanceKey,
          localizationTargetDeviceIds: site.libreNmsDevices
            .filter((device) => device.localizationTarget)
            .map((device) => device.externalId),
          libreNmsSwitches: site.libreNmsDevices.map((device) => ({
            externalId: device.externalId,
            networkName: device.networkName,
          })),
        }
      : null;
  },
});

export const getLocalizationBaseline = internalQuery({
  args: { siteId: v.string() },
  returns: v.array(
    v.object({ externalId: v.string(), freshFdbCount: v.number() }),
  ),
  handler: async (ctx, { siteId }) => {
    const state = await ctx.db
      .query("integrationWorkflowStates")
      .withIndex("by_site_workflow", (q) =>
        q.eq("siteId", siteId).eq("workflow", "localization"),
      )
      .unique();
    if (!state?.lastPublishedId) return [];
    const snapshot = await ctx.db
      .query("localizationSnapshots")
      .withIndex("by_site_snapshot", (q) =>
        q
          .eq("siteId", siteId)
          .eq("snapshotId", state.lastPublishedId as string),
      )
      .unique();
    return (
      snapshot?.switchResults.flatMap((result) =>
        result.freshFdbCount === undefined
          ? []
          : [
              {
                externalId: result.externalId,
                freshFdbCount: result.freshFdbCount,
              },
            ],
      ) ?? []
    );
  },
});

const beginImport = async (
  ctx: ActionCtx,
  args: {
    siteKey: string;
    attemptId: string;
    leaseId: string;
    workflow: "netbox" | "localization";
    origin: "manual" | "scheduled";
  },
): Promise<BeginImportResult> => {
  const config: SiteConnectorConfig | null = await ctx.runQuery(
    internal.connector.getSiteByKey,
    {
      siteKey: args.siteKey,
    },
  );
  if (!config) throw new ConvexError("Site inconnu");
  const result: BeginMutationResult = await ctx.runMutation(
    internal.integrations.begin,
    {
      siteId: config.siteId,
      workflow: args.workflow,
      attemptId: args.attemptId,
      leaseId: args.leaseId,
      origin: args.origin,
    },
  );
  const { siteId, ...publicConfig } = config;
  return { ...result, siteId, config: publicConfig };
};

export const beginNetBoxImport = action({
  args: {
    secret: v.string(),
    siteKey: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    origin: v.optional(v.union(v.literal("manual"), v.literal("scheduled"))),
  },
  returns: importResult,
  handler: async (ctx, args): Promise<BeginImportResult> => {
    requireConnectorSecret(args.secret);
    return await beginImport(ctx, {
      ...args,
      workflow: "netbox",
      origin: args.origin ?? "manual",
    });
  },
});

export const beginLocalizationImport = action({
  args: {
    secret: v.string(),
    siteKey: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    origin: v.optional(v.union(v.literal("manual"), v.literal("scheduled"))),
  },
  returns: importResult,
  handler: async (ctx, args): Promise<BeginImportResult> => {
    requireConnectorSecret(args.secret);
    return await beginImport(ctx, {
      ...args,
      workflow: "localization",
      origin: args.origin ?? "manual",
    });
  },
});

export const publishNetBoxGeneration = action({
  args: {
    secret: v.string(),
    siteId: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
    generationId: v.string(),
    instanceKey: v.string(),
    externalSiteId: v.string(),
    externalSiteSlug: v.string(),
    capturedAt: v.number(),
    sourceVersion: v.optional(v.string()),
    inventory: v.array(inventoryInput),
    connections: v.array(connectionInput),
  },
  returns: v.object({
    generationId: v.string(),
    inventoryCount: v.number(),
    connectionCount: v.number(),
  }),
  handler: async (ctx, args): Promise<NetBoxPublishResult> => {
    requireConnectorSecret(args.secret);
    const { secret: _secret, ...payload } = args;
    return await ctx.runMutation(
      internal.netboxModel.publishGeneration,
      payload,
    );
  },
});

export const readNetBoxGeneration = action({
  args: {
    secret: v.string(),
    siteId: v.string(),
    generationId: v.string(),
  },
  returns: v.object({
    inventory: v.array(inventoryInput),
    connections: v.array(connectionInput),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    inventory: Array<InventoryInput>;
    connections: Array<ConnectionInput>;
  }> => {
    requireConnectorSecret(args.secret);
    return await ctx.runQuery(internal.netboxModel.readGeneration, {
      siteId: args.siteId,
      generationId: args.generationId,
    });
  },
});

export const readLocalizationBaseline = action({
  args: { secret: v.string(), siteId: v.string() },
  returns: v.array(
    v.object({ externalId: v.string(), freshFdbCount: v.number() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ externalId: string; freshFdbCount: number }>> => {
    requireConnectorSecret(args.secret);
    return await ctx.runQuery(internal.connector.getLocalizationBaseline, {
      siteId: args.siteId,
    });
  },
});

export const heartbeatImport = action({
  args: {
    secret: v.string(),
    siteId: v.string(),
    workflow: v.union(v.literal("netbox"), v.literal("localization")),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    requireConnectorSecret(args.secret);
    const { secret: _secret, ...payload } = args;
    return await ctx.runMutation(internal.integrations.heartbeat, payload);
  },
});

export const publishLocalizationSnapshot = action({
  args: {
    secret: v.string(),
    siteId: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
    snapshotId: v.string(),
    netboxGenerationId: v.string(),
    libreNmsInstanceKey: v.string(),
    capturedAt: v.number(),
    switchResults: v.array(switchResultInput),
    observations: v.array(observationInput),
    discoveries: v.array(discoveredConnectionInput),
    diagnostics: v.array(resolutionDiagnosticInput),
  },
  returns: v.object({
    snapshotId: v.string(),
    observationCount: v.number(),
    linkCount: v.number(),
  }),
  handler: async (ctx, args): Promise<LocalizationPublishResult> => {
    requireConnectorSecret(args.secret);
    const { secret: _secret, ...payload } = args;
    return await ctx.runMutation(
      internal.librenmsModel.publishSnapshot,
      payload,
    );
  },
});

const failImport = async (
  ctx: ActionCtx,
  args: {
    siteId: string;
    workflow: "netbox" | "localization";
    attemptId: string;
    leaseId: string;
    fence: number;
  },
): Promise<null> => {
  await ctx.runMutation(internal.integrations.fail, {
    ...args,
    publicError: PUBLIC_IMPORT_ERROR,
  });
  return null;
};

export const failNetBoxImport = action({
  args: {
    secret: v.string(),
    siteId: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireConnectorSecret(args.secret);
    const { secret: _secret, ...payload } = args;
    return await failImport(ctx, { ...payload, workflow: "netbox" });
  },
});

export const failLocalizationImport = action({
  args: {
    secret: v.string(),
    siteId: v.string(),
    attemptId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    requireConnectorSecret(args.secret);
    const { secret: _secret, ...payload } = args;
    return await failImport(ctx, { ...payload, workflow: "localization" });
  },
});
