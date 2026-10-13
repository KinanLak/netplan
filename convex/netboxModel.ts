import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import {
  completeWorkflowSuccess,
  getAttempt,
  requireOwnedAttempt,
} from "./integrationModel";

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
  location: v.optional(v.string()),
  locationPath: v.array(v.string()),
  ip: v.optional(v.string()),
  macs: v.array(v.string()),
  interfaceCount: v.number(),
  cabledTerminationCount: v.number(),
  lifecycleStatus: v.string(),
  url: v.string(),
  sourceUpdatedAt: v.optional(v.string()),
});

export const connectionInput = v.object({
  externalId: v.string(),
  fromExternalId: v.string(),
  fromPort: v.optional(v.string()),
  fromTerminationExternalId: v.string(),
  fromTerminationKind: v.union(
    v.literal("interface"),
    v.literal("front-port"),
    v.literal("rear-port"),
    v.literal("other"),
  ),
  fromPeerTerminationExternalIds: v.array(v.string()),
  toExternalId: v.string(),
  toPort: v.optional(v.string()),
  toTerminationExternalId: v.string(),
  toTerminationKind: v.union(
    v.literal("interface"),
    v.literal("front-port"),
    v.literal("rear-port"),
    v.literal("other"),
  ),
  toPeerTerminationExternalIds: v.array(v.string()),
});

type InventoryInput = Infer<typeof inventoryInput>;
type ConnectionInput = Infer<typeof connectionInput>;

const assertUniqueExternalIds = (
  items: ReadonlyArray<{ externalId: string }>,
  collection: string,
) => {
  const externalIds = new Set<string>();
  for (const item of items) {
    if (externalIds.has(item.externalId)) {
      throw new ConvexError(`Duplicate external ID in ${collection}`);
    }
    externalIds.add(item.externalId);
  }
};

const typeCounts = (inventory: ReadonlyArray<InventoryInput>) => ({
  rackCount: inventory.filter((item) => item.type === "rack").length,
  switchCount: inventory.filter((item) => item.type === "switch").length,
  computerCount: inventory.filter((item) => item.type === "pc").length,
  socketCount: inventory.filter((item) => item.type === "wall-port").length,
});

const assertIntegrity = (args: {
  inventory: ReadonlyArray<InventoryInput>;
  connections: ReadonlyArray<ConnectionInput>;
}) => {
  if (args.inventory.length === 0) {
    throw new ConvexError("NetBox inventory snapshot cannot be empty");
  }
  assertUniqueExternalIds(args.inventory, "inventory");
  assertUniqueExternalIds(args.connections, "connections");
  for (const connection of args.connections) {
    if (
      !connection.fromTerminationExternalId ||
      !connection.toTerminationExternalId ||
      connection.fromTerminationExternalId ===
        connection.toTerminationExternalId
    ) {
      throw new ConvexError("Connection has invalid termination evidence");
    }
  }
};

const assertRetainedCount = (label: string, previous: number, next: number) => {
  if (previous > 0 && next / previous <= 0.2) {
    throw new ConvexError(`NetBox ${label} snapshot is strongly incomplete`);
  }
};

const assertNotAnomalous = async (
  ctx: MutationCtx,
  siteId: string,
  inventory: ReadonlyArray<InventoryInput>,
  connections: ReadonlyArray<ConnectionInput>,
) => {
  const state = await ctx.db
    .query("integrationWorkflowStates")
    .withIndex("by_site_workflow", (q) =>
      q.eq("siteId", siteId).eq("workflow", "netbox"),
    )
    .unique();
  if (!state?.lastPublishedId) return;
  const previous = await ctx.db
    .query("netboxGenerations")
    .withIndex("by_site_generation", (q) =>
      q
        .eq("siteId", siteId)
        .eq("generationId", state.lastPublishedId as string),
    )
    .unique();
  if (!previous) throw new Error("Active NetBox generation is missing");
  const counts = typeCounts(inventory);
  assertRetainedCount("inventory", previous.inventoryCount, inventory.length);
  assertRetainedCount("sockets", previous.socketCount, counts.socketCount);
  assertRetainedCount(
    "connections",
    previous.connectionCount,
    connections.length,
  );
};

export const publishGeneration = internalMutation({
  args: {
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
  handler: async (ctx, args) => {
    const existingGeneration = await ctx.db
      .query("netboxGenerations")
      .withIndex("by_site_generation", (q) =>
        q.eq("siteId", args.siteId).eq("generationId", args.generationId),
      )
      .unique();
    if (existingGeneration) {
      if (existingGeneration.attemptId !== args.attemptId) {
        throw new ConvexError("NetBox generation identity already exists");
      }
      return {
        generationId: existingGeneration.generationId,
        inventoryCount: existingGeneration.inventoryCount,
        connectionCount: existingGeneration.connectionCount,
      };
    }

    const { attempt, site } = await requireOwnedAttempt(ctx, {
      ...args,
      workflow: "netbox",
    });
    if (
      args.instanceKey !== site.netboxInstanceKey ||
      args.externalSiteId !== site.netboxExternalSiteId ||
      args.externalSiteSlug !== site.netboxExternalSiteSlug
    ) {
      throw new ConvexError("NetBox payload belongs to another site");
    }
    assertIntegrity(args);
    await assertNotAnomalous(
      ctx,
      args.siteId,
      args.inventory,
      args.connections,
    );

    const counts = typeCounts(args.inventory);
    const publishedAt = Date.now();
    await ctx.db.insert("netboxGenerations", {
      siteId: args.siteId,
      generationId: args.generationId,
      attemptId: args.attemptId,
      instanceKey: args.instanceKey,
      externalSiteId: args.externalSiteId,
      externalSiteSlug: args.externalSiteSlug,
      configVersion: attempt.configVersion,
      capturedAt: args.capturedAt,
      publishedAt,
      sourceVersion: args.sourceVersion,
      inventoryCount: args.inventory.length,
      connectionCount: args.connections.length,
      ...counts,
    });
    for (const item of args.inventory) {
      await ctx.db.insert("netboxInventory", {
        siteId: args.siteId,
        generationId: args.generationId,
        instanceKey: args.instanceKey,
        provider: "netbox",
        ...item,
        capturedAt: args.capturedAt,
      });
    }
    for (const connection of args.connections) {
      await ctx.db.insert("netboxConnections", {
        siteId: args.siteId,
        generationId: args.generationId,
        instanceKey: args.instanceKey,
        provider: "netbox",
        ...connection,
        kind: "physical",
        capturedAt: args.capturedAt,
      });
    }
    await completeWorkflowSuccess(ctx, {
      siteId: args.siteId,
      workflow: "netbox",
      attemptId: args.attemptId,
      leaseId: args.leaseId,
      fence: args.fence,
      publishedId: args.generationId,
      primaryCount: args.inventory.length,
      secondaryCount: args.connections.length,
    });
    return {
      generationId: args.generationId,
      inventoryCount: args.inventory.length,
      connectionCount: args.connections.length,
    };
  },
});

export const readGeneration = internalQuery({
  args: { siteId: v.string(), generationId: v.string() },
  returns: v.object({
    inventory: v.array(inventoryInput),
    connections: v.array(connectionInput),
  }),
  handler: async (ctx, { siteId, generationId }) => {
    const generation = await ctx.db
      .query("netboxGenerations")
      .withIndex("by_site_generation", (q) =>
        q.eq("siteId", siteId).eq("generationId", generationId),
      )
      .unique();
    if (!generation) throw new ConvexError("NetBox generation not found");
    const [inventory, connections] = await Promise.all([
      ctx.db
        .query("netboxInventory")
        .withIndex("by_generation", (q) =>
          q.eq("siteId", siteId).eq("generationId", generationId),
        )
        .collect(),
      ctx.db
        .query("netboxConnections")
        .withIndex("by_generation", (q) =>
          q.eq("siteId", siteId).eq("generationId", generationId),
        )
        .collect(),
    ]);
    const cabledTerminationCountByDevice = new Map<string, number>();
    for (const connection of connections) {
      for (const externalId of [
        connection.fromExternalId,
        connection.toExternalId,
      ]) {
        cabledTerminationCountByDevice.set(
          externalId,
          (cabledTerminationCountByDevice.get(externalId) ?? 0) + 1,
        );
      }
    }
    return {
      inventory: inventory.map(
        ({
          _id,
          _creationTime,
          siteId: _siteId,
          generationId: _generationId,
          instanceKey: _instanceKey,
          provider: _provider,
          capturedAt: _capturedAt,
          ...item
        }) => ({
          ...item,
          cabledTerminationCount:
            item.cabledTerminationCount ??
            cabledTerminationCountByDevice.get(item.externalId) ??
            0,
        }),
      ),
      connections: connections.map(
        ({
          _id,
          _creationTime,
          siteId: _siteId,
          generationId: _generationId,
          instanceKey: _instanceKey,
          provider: _provider,
          kind: _kind,
          capturedAt: _capturedAt,
          ...connection
        }) => ({
          ...connection,
          fromTerminationExternalId:
            connection.fromTerminationExternalId ??
            `legacy:${connection.externalId}:from`,
          fromTerminationKind:
            connection.fromTerminationKind ?? ("interface" as const),
          fromPeerTerminationExternalIds:
            connection.fromPeerTerminationExternalIds ?? [],
          toTerminationExternalId:
            connection.toTerminationExternalId ??
            `legacy:${connection.externalId}:to`,
          toTerminationKind:
            connection.toTerminationKind ?? ("interface" as const),
          toPeerTerminationExternalIds:
            connection.toPeerTerminationExternalIds ?? [],
        }),
      ),
    };
  },
});

export const getPublishedAttempt = async (
  ctx: MutationCtx,
  siteId: string,
  attemptId: string,
) => await getAttempt(ctx, siteId, "netbox", attemptId);
