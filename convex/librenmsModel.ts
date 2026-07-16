import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";

const SITE = "Arles";

export const discoveredConnectionInput = v.object({
  externalId: v.string(),
  computerExternalId: v.string(),
  socketExternalId: v.string(),
  switchExternalId: v.string(),
  switchPort: v.string(),
  computerMac: v.optional(v.string()),
  method: v.union(v.literal("fdb"), v.literal("lldp"), v.literal("fdb+lldp")),
  confidence: v.union(v.literal("high"), v.literal("medium")),
  observedAt: v.number(),
});

const getSyncRow = async (ctx: MutationCtx) =>
  await ctx.db
    .query("integrationSyncs")
    .withIndex("by_provider_site", (q) =>
      q.eq("provider", "librenms").eq("site", SITE),
    )
    .unique();

export const setLibreNmsSyncing = async (
  ctx: MutationCtx,
  args: { syncId: string; startedAt: number },
) => {
  const existing = await getSyncRow(ctx);
  const value = {
    provider: "librenms" as const,
    site: SITE,
    syncId: args.syncId,
    status: "syncing" as const,
    startedAt: args.startedAt,
    inventoryCount: existing?.inventoryCount ?? 0,
    connectionCount: existing?.connectionCount ?? 0,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("integrationSyncs", value);
  return true;
};

export const setLibreNmsFailed = async (
  ctx: MutationCtx,
  args: {
    syncId: string;
    startedAt: number;
    completedAt: number;
    error: string;
  },
) => {
  const existing = await getSyncRow(ctx);
  if (existing && existing.syncId !== args.syncId) return false;
  const value = {
    provider: "librenms" as const,
    site: SITE,
    syncId: args.syncId,
    status: "error" as const,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    error: args.error,
    inventoryCount: existing?.inventoryCount ?? 0,
    connectionCount: existing?.connectionCount ?? 0,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("integrationSyncs", value);
  return true;
};

interface ReplaceLibreNmsDiscoveriesArgs {
  syncId: string;
  startedAt: number;
  completedAt: number;
  discoveries: Array<Infer<typeof discoveredConnectionInput>>;
}

export const replaceLibreNmsDiscoveries = async (
  ctx: MutationCtx,
  args: ReplaceLibreNmsDiscoveriesArgs,
) => {
  const activeSync = await getSyncRow(ctx);
  if (
    !activeSync ||
    activeSync.status !== "syncing" ||
    activeSync.syncId !== args.syncId
  ) {
    throw new Error("La synchronisation LibreNMS a été remplacée");
  }
  const existing = await ctx.db
    .query("discoveredConnections")
    .withIndex("by_provider_site", (q) =>
      q.eq("provider", "librenms").eq("site", SITE),
    )
    .collect();
  const existingById = new Map(existing.map((item) => [item.externalId, item]));
  const nextIds = new Set(args.discoveries.map((item) => item.externalId));
  for (const item of existing) {
    if (!nextIds.has(item.externalId)) await ctx.db.delete(item._id);
  }
  for (const discovery of args.discoveries) {
    const previous = existingById.get(discovery.externalId);
    const value = {
      provider: "librenms" as const,
      site: SITE,
      ...discovery,
      syncedAt: args.completedAt,
    };
    if (previous) await ctx.db.replace(previous._id, value);
    else await ctx.db.insert("discoveredConnections", value);
  }

  const syncRow = await getSyncRow(ctx);
  const syncValue = {
    provider: "librenms" as const,
    site: SITE,
    syncId: args.syncId,
    status: "ready" as const,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    inventoryCount: 0,
    connectionCount: args.discoveries.length,
  };
  if (syncRow) await ctx.db.replace(syncRow._id, syncValue);
  else await ctx.db.insert("integrationSyncs", syncValue);
  return { connectionCount: args.discoveries.length };
};
