import { v } from "convex/values";
import type { Infer } from "convex/values";
import type { MutationCtx } from "./_generated/server";

export const inventoryInput = v.object({
  externalId: v.string(),
  type: v.union(
    v.literal("rack"),
    v.literal("switch"),
    v.literal("pc"),
    v.literal("wall-port"),
  ),
  name: v.string(),
  hostname: v.optional(v.string()),
  model: v.optional(v.string()),
  role: v.string(),
  site: v.string(),
  location: v.optional(v.string()),
  locationPath: v.array(v.string()),
  ip: v.optional(v.string()),
  macs: v.array(v.string()),
  interfaceCount: v.number(),
  lifecycleStatus: v.string(),
  url: v.string(),
  sourceUpdatedAt: v.optional(v.string()),
});

export const connectionInput = v.object({
  externalId: v.string(),
  fromExternalId: v.string(),
  fromPort: v.optional(v.string()),
  toExternalId: v.string(),
  toPort: v.optional(v.string()),
});

const getSyncRow = async (ctx: MutationCtx, site: string) =>
  await ctx.db
    .query("integrationSyncs")
    .withIndex("by_provider_site", (q) =>
      q.eq("provider", "netbox").eq("site", site),
    )
    .unique();

export const setNetBoxSyncing = async (
  ctx: MutationCtx,
  args: { site: string; syncId: string; startedAt: number },
) => {
  const existing = await getSyncRow(ctx, args.site);
  const value = {
    provider: "netbox" as const,
    site: args.site,
    syncId: args.syncId,
    status: "syncing" as const,
    startedAt: args.startedAt,
    inventoryCount: existing?.inventoryCount ?? 0,
    connectionCount: existing?.connectionCount ?? 0,
  };
  if (existing) {
    await ctx.db.replace(existing._id, value);
  } else {
    await ctx.db.insert("integrationSyncs", value);
  }
  return true;
};

export const setNetBoxFailed = async (
  ctx: MutationCtx,
  args: {
    site: string;
    syncId: string;
    startedAt: number;
    completedAt: number;
    error: string;
  },
) => {
  const existing = await getSyncRow(ctx, args.site);
  if (existing && existing.syncId !== args.syncId) return false;
  const value = {
    provider: "netbox" as const,
    site: args.site,
    syncId: args.syncId,
    status: "error" as const,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    error: args.error,
    inventoryCount: existing?.inventoryCount ?? 0,
    connectionCount: existing?.connectionCount ?? 0,
  };
  if (existing) {
    await ctx.db.replace(existing._id, value);
  } else {
    await ctx.db.insert("integrationSyncs", value);
  }
  return true;
};

interface ReplaceNetBoxSnapshotArgs {
  site: string;
  syncId: string;
  startedAt: number;
  completedAt: number;
  sourceVersion?: string;
  inventory: Array<Infer<typeof inventoryInput>>;
  connections: Array<Infer<typeof connectionInput>>;
}

export const replaceNetBoxSnapshot = async (
  ctx: MutationCtx,
  args: ReplaceNetBoxSnapshotArgs,
) => {
  const activeSync = await getSyncRow(ctx, args.site);
  if (
    !activeSync ||
    activeSync.status !== "syncing" ||
    activeSync.syncId !== args.syncId
  ) {
    throw new Error("La synchronisation NetBox a été remplacée");
  }
  const syncedAt = args.completedAt;
  const previousInventory = await ctx.db
    .query("externalInventory")
    .withIndex("by_provider_site", (q) =>
      q.eq("provider", "netbox").eq("site", args.site),
    )
    .collect();
  const previousInventoryById = new Map(
    previousInventory.map((item) => [item.externalId, item]),
  );
  const nextInventoryIds = new Set(args.inventory.map((x) => x.externalId));

  for (const item of previousInventory) {
    if (!nextInventoryIds.has(item.externalId)) await ctx.db.delete(item._id);
  }
  for (const item of args.inventory) {
    const existing = previousInventoryById.get(item.externalId);
    const value = { provider: "netbox" as const, ...item, syncedAt };
    if (existing) {
      await ctx.db.replace(existing._id, value);
    } else {
      await ctx.db.insert("externalInventory", value);
    }
  }

  const previousConnections = await ctx.db
    .query("externalConnections")
    .withIndex("by_provider_site", (q) =>
      q.eq("provider", "netbox").eq("site", args.site),
    )
    .collect();
  const previousConnectionsById = new Map(
    previousConnections.map((item) => [item.externalId, item]),
  );
  const nextConnectionIds = new Set(
    args.connections.map((item) => item.externalId),
  );

  for (const connection of previousConnections) {
    if (!nextConnectionIds.has(connection.externalId)) {
      await ctx.db.delete(connection._id);
    }
  }
  for (const connection of args.connections) {
    const existing = previousConnectionsById.get(connection.externalId);
    const value = {
      provider: "netbox" as const,
      site: args.site,
      ...connection,
      kind: "physical" as const,
      syncedAt,
    };
    if (existing) {
      await ctx.db.replace(existing._id, value);
    } else {
      await ctx.db.insert("externalConnections", value);
    }
  }

  const syncRow = await getSyncRow(ctx, args.site);
  const syncValue = {
    provider: "netbox" as const,
    site: args.site,
    syncId: args.syncId,
    status: "ready" as const,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    inventoryCount: args.inventory.length,
    connectionCount: args.connections.length,
    sourceVersion: args.sourceVersion,
  };
  if (syncRow) {
    await ctx.db.replace(syncRow._id, syncValue);
  } else {
    await ctx.db.insert("integrationSyncs", syncValue);
  }

  return {
    inventoryCount: args.inventory.length,
    connectionCount: args.connections.length,
  };
};
