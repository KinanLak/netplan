import { ConvexError, v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  connectionInput,
  inventoryInput,
  replaceNetBoxSnapshot,
  setNetBoxFailed,
  setNetBoxSyncing,
} from "./netboxModel";
import {
  discoveredConnectionInput,
  replaceLibreNmsDiscoveries,
  setLibreNmsFailed,
  setLibreNmsSyncing,
} from "./librenmsModel";

declare const process: { env: Record<string, string | undefined> };

const SITE = "Arles";
const SYNC_FAILED_MESSAGE = "La synchronisation des intégrations a échoué";
type SyncFailureOutcome =
  | { status: "failed" }
  | { status: "ignored" }
  | {
      status: "ready";
      inventoryCount: number;
      physicalConnectionCount: number;
      discoveredConnectionCount: number;
    };
const syncFailureOutcome = v.union(
  v.object({ status: v.literal("failed") }),
  v.object({ status: v.literal("ignored") }),
  v.object({
    status: v.literal("ready"),
    inventoryCount: v.number(),
    physicalConnectionCount: v.number(),
    discoveredConnectionCount: v.number(),
  }),
);

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

const getArlesSyncRows = async (ctx: MutationCtx) =>
  await Promise.all([
    ctx.db
      .query("integrationSyncs")
      .withIndex("by_provider_site", (q) =>
        q.eq("provider", "netbox").eq("site", SITE),
      )
      .unique(),
    ctx.db
      .query("integrationSyncs")
      .withIndex("by_provider_site", (q) =>
        q.eq("provider", "librenms").eq("site", SITE),
      )
      .unique(),
  ]);

export const markArlesSyncing = internalMutation({
  args: { syncId: v.string(), startedAt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const netboxAccepted = await setNetBoxSyncing(ctx, {
      site: SITE,
      ...args,
    });
    const libreNmsAccepted = await setLibreNmsSyncing(ctx, args);
    if (!netboxAccepted || !libreNmsAccepted) {
      throw new Error("États de synchronisation incohérents");
    }
    return true;
  },
});

export const markArlesFailed = internalMutation({
  args: {
    syncId: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
  },
  returns: syncFailureOutcome,
  handler: async (ctx, args): Promise<SyncFailureOutcome> => {
    const [netboxSync, libreNmsSync] = await getArlesSyncRows(ctx);
    if (
      netboxSync?.syncId === args.syncId &&
      libreNmsSync?.syncId === args.syncId &&
      netboxSync.status === "ready" &&
      libreNmsSync.status === "ready"
    ) {
      return {
        status: "ready" as const,
        inventoryCount: netboxSync.inventoryCount,
        physicalConnectionCount: netboxSync.connectionCount,
        discoveredConnectionCount: libreNmsSync.connectionCount,
      };
    }
    if (
      [netboxSync, libreNmsSync].some(
        (sync) =>
          !sync || sync.status !== "syncing" || sync.syncId !== args.syncId,
      )
    ) {
      return { status: "ignored" as const };
    }
    const failure = { ...args, error: SYNC_FAILED_MESSAGE };
    const netboxAccepted = await setNetBoxFailed(ctx, {
      site: SITE,
      ...failure,
    });
    const libreNmsAccepted = await setLibreNmsFailed(ctx, failure);
    if (!netboxAccepted || !libreNmsAccepted) {
      throw new Error("États de synchronisation incohérents");
    }
    return { status: "failed" as const };
  },
});

export const replaceArlesSnapshot = internalMutation({
  args: {
    syncId: v.string(),
    startedAt: v.number(),
    capturedAt: v.number(),
    sourceVersion: v.optional(v.string()),
    inventory: v.array(inventoryInput),
    physicalConnections: v.array(connectionInput),
    discoveries: v.array(discoveredConnectionInput),
  },
  returns: v.object({
    inventoryCount: v.number(),
    physicalConnectionCount: v.number(),
    discoveredConnectionCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const netboxResult = await replaceNetBoxSnapshot(ctx, {
      site: SITE,
      syncId: args.syncId,
      startedAt: args.startedAt,
      completedAt: args.capturedAt,
      sourceVersion: args.sourceVersion,
      inventory: args.inventory,
      connections: args.physicalConnections,
    });
    const libreNmsResult = await replaceLibreNmsDiscoveries(ctx, {
      syncId: args.syncId,
      startedAt: args.startedAt,
      completedAt: args.capturedAt,
      discoveries: args.discoveries,
    });
    return {
      inventoryCount: netboxResult.inventoryCount,
      physicalConnectionCount: netboxResult.connectionCount,
      discoveredConnectionCount: libreNmsResult.connectionCount,
    };
  },
});

export const beginArlesSync = action({
  args: { secret: v.string(), syncId: v.string(), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requireConnectorSecret(args.secret);
    const accepted = await ctx.runMutation(
      internal.connector.markArlesSyncing,
      { syncId: args.syncId, startedAt: args.startedAt },
    );
    if (!accepted) {
      throw new ConvexError("Une synchronisation plus récente est en cours");
    }
    return null;
  },
});

export const failArlesSync = action({
  args: {
    secret: v.string(),
    syncId: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
  },
  returns: syncFailureOutcome,
  handler: async (ctx, args): Promise<SyncFailureOutcome> => {
    requireConnectorSecret(args.secret);
    return await ctx.runMutation(internal.connector.markArlesFailed, {
      syncId: args.syncId,
      startedAt: args.startedAt,
      completedAt: args.completedAt,
    });
  },
});

export const pushArlesSnapshot = action({
  args: {
    secret: v.string(),
    syncId: v.string(),
    startedAt: v.number(),
    capturedAt: v.number(),
    sourceVersion: v.optional(v.string()),
    inventory: v.array(inventoryInput),
    physicalConnections: v.array(connectionInput),
    discoveries: v.array(discoveredConnectionInput),
  },
  returns: v.object({
    inventoryCount: v.number(),
    physicalConnectionCount: v.number(),
    discoveredConnectionCount: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    inventoryCount: number;
    physicalConnectionCount: number;
    discoveredConnectionCount: number;
  }> => {
    requireConnectorSecret(args.secret);
    try {
      return await ctx.runMutation(internal.connector.replaceArlesSnapshot, {
        syncId: args.syncId,
        startedAt: args.startedAt,
        capturedAt: args.capturedAt,
        sourceVersion: args.sourceVersion,
        inventory: args.inventory,
        physicalConnections: args.physicalConnections,
        discoveries: args.discoveries,
      });
    } catch (error: unknown) {
      console.error("Échec de la synchronisation des intégrations", error);
      try {
        const outcome = await ctx.runMutation(
          internal.connector.markArlesFailed,
          {
            syncId: args.syncId,
            startedAt: args.startedAt,
            completedAt: Date.now(),
          },
        );
        if (outcome.status === "ready") {
          return {
            inventoryCount: outcome.inventoryCount,
            physicalConnectionCount: outcome.physicalConnectionCount,
            discoveredConnectionCount: outcome.discoveredConnectionCount,
          };
        }
      } catch (statusError: unknown) {
        console.error("Impossible d'enregistrer l'échec", statusError);
      }
      throw new ConvexError(SYNC_FAILED_MESSAGE);
    }
  },
});
