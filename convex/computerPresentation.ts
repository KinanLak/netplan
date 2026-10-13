import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type ReadCtx = Pick<QueryCtx, "db">;

export const getExpiredDeviceIdsForFloor = async (
  ctx: ReadCtx,
  floorId: string,
): Promise<Set<string>> => {
  const bindings = await ctx.db
    .query("externalObjectBindings")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  const locations = await Promise.all(
    bindings.map((binding) =>
      ctx.db
        .query("computerLocations")
        .withIndex("by_site_computer", (q) =>
          q
            .eq("siteId", binding.siteId)
            .eq("computerExternalId", binding.externalId),
        )
        .unique(),
    ),
  );
  return new Set(
    bindings.flatMap((binding, index) =>
      locations[index]?.expiredAt === undefined ? [] : [binding.deviceId],
    ),
  );
};

export const getComputerPresentationsForFloor = async (
  ctx: ReadCtx,
  floorId: string,
) => {
  const bindings = await ctx.db
    .query("externalObjectBindings")
    .withIndex("by_floor", (q) => q.eq("floorId", floorId))
    .collect();
  const uniqueBindings = bindings.filter(
    (binding, index, values) =>
      values.findIndex((item) => item.deviceId === binding.deviceId) ===
        index &&
      values.filter((item) => item.deviceId === binding.deviceId).length === 1,
  );
  const presentations = await Promise.all(
    uniqueBindings.map(async (binding) => {
      const [location, workflow] = await Promise.all([
        ctx.db
          .query("computerLocations")
          .withIndex("by_site_computer", (q) =>
            q
              .eq("siteId", binding.siteId)
              .eq("computerExternalId", binding.externalId),
          )
          .unique(),
        ctx.db
          .query("integrationWorkflowStates")
          .withIndex("by_site_workflow", (q) =>
            q.eq("siteId", binding.siteId).eq("workflow", "netbox"),
          )
          .unique(),
      ]);
      const inventory = workflow?.lastPublishedId
        ? await ctx.db
            .query("netboxInventory")
            .withIndex("by_generation_external", (q) =>
              q
                .eq("siteId", binding.siteId)
                .eq("generationId", workflow.lastPublishedId as string)
                .eq("externalId", binding.externalId),
            )
            .unique()
        : null;
      return {
        binding,
        location,
        inventory:
          inventory?.instanceKey === binding.instanceKey ? inventory : null,
      };
    }),
  );
  return new Map(
    presentations.map((presentation) => [
      presentation.binding.deviceId,
      presentation,
    ]),
  );
};

export const toPublicDevice = (
  row: Doc<"devices">,
  presentation?: {
    binding: Doc<"externalObjectBindings">;
    location: Doc<"computerLocations"> | null;
    inventory: Doc<"netboxInventory"> | null;
  },
) => {
  const source = row.metadata.source;
  const sourceMatchesBinding =
    source?.provider === "netbox" &&
    source.siteId === presentation?.binding.siteId &&
    source.instanceKey === presentation.binding.instanceKey &&
    source.externalId === presentation.binding.externalId;
  const inventory = sourceMatchesBinding ? presentation.inventory : null;
  const location = presentation?.location;
  const metadata: Doc<"devices">["metadata"] = { ...row.metadata };
  delete metadata.macs;
  if (inventory && source) {
    metadata.ip = inventory.ip;
    metadata.model = inventory.model;
    metadata.source = {
      ...source,
      url: inventory.url,
      location: inventory.location,
      locationPath: inventory.locationPath,
      role: inventory.role,
      lifecycleStatus: inventory.lifecycleStatus,
      syncedAt: inventory.capturedAt,
    };
  }
  if (location) {
    const positionIsCurrent =
      location.state === "online" &&
      location.projectionStatus === "success" &&
      location.lastKnownFloorId === row.floorId &&
      location.lastKnownPosition?.x === row.position.x &&
      location.lastKnownPosition.y === row.position.y;
    metadata.localization = {
      state: location.state,
      reason: location.reason,
      positionState: positionIsCurrent ? "current" : "historical",
      projectionStatus: location.projectionStatus,
      targetFloorId: location.projectionTargetFloorId,
      targetPosition: location.projectionTargetPosition,
      errorCode: location.projectionErrorCode,
      nextAttemptAt: location.projectionNextAttemptAt,
    };
  }
  return {
    id: row.objectId,
    floorId: row.floorId,
    type: row.type,
    name: inventory?.name ?? row.name,
    hostname: inventory ? inventory.hostname : row.hostname,
    position: row.position,
    size: row.size,
    metadata,
  };
};

export const bumpComputerPresentationRevision = async (
  ctx: MutationCtx,
  siteId: string,
  computerExternalId: string,
  now: number,
) => {
  const bindings = await ctx.db
    .query("externalObjectBindings")
    .withIndex("by_external", (q) => q.eq("siteId", siteId))
    .collect();
  const computerBindings = bindings.filter(
    (binding) => binding.externalId === computerExternalId,
  );
  for (const floorId of new Set(
    computerBindings.map((binding) => binding.floorId),
  )) {
    const revision = await ctx.db
      .query("documentRevisions")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .unique();
    if (revision) {
      await ctx.db.patch(revision._id, {
        revision: revision.revision + 1,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("documentRevisions", {
        floorId,
        revision: 1,
        updatedAt: now,
      });
    }
  }
};
