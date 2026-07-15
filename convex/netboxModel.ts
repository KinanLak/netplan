import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
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

export const markSyncing = internalMutation({
  args: { site: v.string(), startedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { site, startedAt }) => {
    const existing = await getSyncRow(ctx, site);
    const value = {
      provider: "netbox" as const,
      site,
      status: "syncing" as const,
      startedAt,
      inventoryCount: existing?.inventoryCount ?? 0,
      connectionCount: existing?.connectionCount ?? 0,
    };
    if (existing) {
      await ctx.db.replace(existing._id, value);
    } else {
      await ctx.db.insert("integrationSyncs", value);
    }
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    site: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await getSyncRow(ctx, args.site);
    const value = {
      provider: "netbox" as const,
      site: args.site,
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
    return null;
  },
});

export const replaceSnapshot = internalMutation({
  args: {
    site: v.string(),
    startedAt: v.number(),
    completedAt: v.number(),
    sourceVersion: v.optional(v.string()),
    inventory: v.array(inventoryInput),
    connections: v.array(connectionInput),
  },
  returns: v.object({
    inventoryCount: v.number(),
    connectionCount: v.number(),
  }),
  handler: async (ctx, args) => {
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
      .withIndex("by_provider_external", (q) => q.eq("provider", "netbox"))
      .collect();
    const previousConnectionsById = new Map(
      previousConnections.map((item) => [item.externalId, item]),
    );
    const nextConnectionIds = new Set(
      args.connections.map((item) => item.externalId),
    );

    for (const connection of previousConnections) {
      if (
        connection.site === args.site &&
        !nextConnectionIds.has(connection.externalId)
      ) {
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
  },
});
