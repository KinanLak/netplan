import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  bumpComputerPresentationRevision,
  getExpiredDeviceIdsForFloor,
} from "./computerPresentation";
import { applyIntegrationDeviceRelocation } from "./mapOperations";

const GRID_SIZE = 20;
const PC_SIZE = { width: 80, height: 80 } as const;
const LEASE_MS = 2 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000] as const;
const BLOCKED_RECHECK_MS = 5 * 60_000;
const SWEEP_PART_SIZE = 8;

type ReadCtx = Pick<QueryCtx, "db">;
type SocketDevice = Pick<
  Doc<"devices">,
  "objectId" | "floorId" | "position" | "size"
>;

interface ProjectionComputer {
  instanceKey: string;
  name: string;
  hostname?: string;
  ip?: string;
  model?: string;
  url: string;
  location?: string;
  locationPath: Array<string>;
  role: string;
  lifecycleStatus: string;
  syncedAt: number;
}

const rectanglesOverlap = (
  pos1: { x: number; y: number },
  size1: { width: number; height: number },
  pos2: { x: number; y: number },
  size2: { width: number; height: number },
): boolean =>
  !(
    pos1.x + size1.width <= pos2.x ||
    pos2.x + size2.width <= pos1.x ||
    pos1.y + size1.height <= pos2.y ||
    pos2.y + size2.height <= pos1.y
  );

const wallCollisionRect = (wall: Doc<"walls">) => {
  if (wall.start.x === wall.end.x && wall.start.y === wall.end.y) {
    return {
      x: wall.start.x - GRID_SIZE / 2,
      y: wall.start.y - GRID_SIZE / 2,
      width: GRID_SIZE,
      height: GRID_SIZE,
    };
  }
  if (wall.start.y === wall.end.y) {
    return {
      x: Math.min(wall.start.x, wall.end.x),
      y: wall.start.y - GRID_SIZE / 2,
      width: Math.abs(wall.end.x - wall.start.x),
      height: GRID_SIZE,
    };
  }
  return {
    x: wall.start.x - GRID_SIZE / 2,
    y: Math.min(wall.start.y, wall.end.y),
    width: GRID_SIZE,
    height: Math.abs(wall.end.y - wall.start.y),
  };
};

const snap = (value: number): number =>
  Math.round(value / GRID_SIZE) * GRID_SIZE;

export const projectionPositions = (
  socket: SocketDevice,
  deviceSize: { width: number; height: number } = PC_SIZE,
): Array<{ x: number; y: number }> => {
  const center = {
    x: socket.position.x + socket.size.width / 2,
    y: socket.position.y + socket.size.height / 2,
  };
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ] as const;
  const positions: Array<{ x: number; y: number }> = [];
  for (let ring = 1; ring <= 4; ring += 1) {
    const distance = ring * 100;
    for (const [dx, dy] of directions) {
      positions.push({
        x: snap(center.x + dx * distance - deviceSize.width / 2),
        y: snap(center.y + dy * distance - deviceSize.height / 2),
      });
    }
  }
  return positions;
};

const findPlacement = async (
  ctx: ReadCtx,
  floorId: string,
  socket: SocketDevice,
  deviceSize: { width: number; height: number },
  excludedDeviceId?: string,
): Promise<
  | { position: { x: number; y: number } }
  | { errorCode: "device_collision" | "wall_collision" }
> => {
  const [devices, expiredDeviceIds, walls] = await Promise.all([
    ctx.db
      .query("devices")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect(),
    getExpiredDeviceIdsForFloor(ctx, floorId),
    ctx.db
      .query("walls")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .collect(),
  ]);
  const candidates = projectionPositions(socket, deviceSize);
  let deviceCollision = false;
  for (const candidate of candidates) {
    const collidesWithDevice = devices.some(
      (device) =>
        device.objectId !== excludedDeviceId &&
        !expiredDeviceIds.has(device.objectId) &&
        rectanglesOverlap(candidate, deviceSize, device.position, device.size),
    );
    if (collidesWithDevice) {
      deviceCollision = true;
      continue;
    }
    const collidesWithWall = walls.some((wall) => {
      const rect = wallCollisionRect(wall);
      return rectanglesOverlap(
        candidate,
        deviceSize,
        { x: rect.x, y: rect.y },
        { width: rect.width, height: rect.height },
      );
    });
    if (!collidesWithWall) return { position: candidate };
  }
  return {
    errorCode: deviceCollision ? "device_collision" : "wall_collision",
  };
};

const computerBinding = async (
  ctx: ReadCtx,
  siteId: string,
  instanceKey: string,
  computerExternalId: string,
) => {
  const rows = await ctx.db
    .query("externalObjectBindings")
    .withIndex("by_external", (q) =>
      q
        .eq("siteId", siteId)
        .eq("provider", "netbox")
        .eq("instanceKey", instanceKey)
        .eq("externalId", computerExternalId),
    )
    .collect();
  return rows.length === 1 ? rows[0] : rows.length === 0 ? null : "duplicate";
};

const getDevice = async (ctx: ReadCtx, objectId: string) =>
  await ctx.db
    .query("devices")
    .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
    .unique();

export const publishProjectionTarget = async (
  ctx: MutationCtx,
  args: {
    siteId: string;
    computerExternalId: string;
    cycleId: string;
    socketExternalId: string;
    socketDevice: Doc<"devices">;
    computer: ProjectionComputer;
    occurredAt: number;
    canKeepSuccess: boolean;
    canKeepBlocked: boolean;
  },
) => {
  const binding = await computerBinding(
    ctx,
    args.siteId,
    args.computer.instanceKey,
    args.computerExternalId,
  );
  const existingDevice =
    binding && binding !== "duplicate"
      ? await getDevice(ctx, binding.deviceId)
      : null;
  const sourceDevice = existingDevice?.type === "pc" ? existingDevice : null;
  const previous = await ctx.db
    .query("computerProjections")
    .withIndex("by_site_computer", (q) =>
      q
        .eq("siteId", args.siteId)
        .eq("computerExternalId", args.computerExternalId),
    )
    .unique();
  if (
    args.canKeepSuccess &&
    previous?.state === "success" &&
    previous.socketExternalId === args.socketExternalId &&
    sourceDevice?.floorId === args.socketDevice.floorId
  ) {
    return {
      published: false as const,
      status: "success" as const,
      cycleId: args.cycleId,
      targetFloorId: sourceDevice.floorId,
      targetPosition: sourceDevice.position,
    };
  }
  if (
    args.canKeepBlocked &&
    previous?.state === "blocked" &&
    previous.errorCode === "blocked_by_links" &&
    previous.socketExternalId === args.socketExternalId &&
    previous.targetFloorId === args.socketDevice.floorId &&
    sourceDevice &&
    sourceDevice.floorId !== args.socketDevice.floorId
  ) {
    const [outgoing, incoming] = await Promise.all([
      ctx.db
        .query("links")
        .withIndex("by_from_device", (q) =>
          q.eq("fromDeviceId", sourceDevice.objectId),
        )
        .first(),
      ctx.db
        .query("links")
        .withIndex("by_to_device", (q) =>
          q.eq("toDeviceId", sourceDevice.objectId),
        )
        .first(),
    ]);
    if (outgoing || incoming) {
      return {
        published: false as const,
        status: "blocked" as const,
        cycleId: previous.cycleId,
        targetFloorId: previous.targetFloorId,
        targetPosition: previous.targetPosition,
        errorCode: previous.errorCode,
        nextAttemptAt: previous.nextAttemptAt,
      };
    }
  }
  const placement = await findPlacement(
    ctx,
    args.socketDevice.floorId,
    args.socketDevice,
    sourceDevice?.size ?? PC_SIZE,
    sourceDevice?.objectId,
  );
  const targetPosition =
    "position" in placement
      ? placement.position
      : projectionPositions(
          args.socketDevice,
          sourceDevice?.size ?? PC_SIZE,
        )[0];
  const next = {
    siteId: args.siteId,
    computerExternalId: args.computerExternalId,
    cycleId: args.cycleId,
    state: "pending" as const,
    fence: (previous?.fence ?? 0) + 1,
    leaseId: undefined,
    leaseExpiresAt: undefined,
    attemptCount: 0,
    nextAttemptAt: args.occurredAt,
    errorCode: undefined,
    socketExternalId: args.socketExternalId,
    socketDeviceId: args.socketDevice.objectId,
    sourceFloorId: sourceDevice?.floorId,
    sourcePosition: sourceDevice?.position,
    targetFloorId: args.socketDevice.floorId,
    targetPosition,
    computer: args.computer,
    createdAt: previous?.createdAt ?? args.occurredAt,
    updatedAt: args.occurredAt,
    completedAt: undefined,
  };
  if (previous) await ctx.db.patch(previous._id, next);
  else await ctx.db.insert("computerProjections", next);
  await ctx.scheduler.runAfter(0, internal.computerProjection.claim, {
    siteId: args.siteId,
    computerExternalId: args.computerExternalId,
    cycleId: args.cycleId,
    leaseId: `projection:${args.cycleId}:${args.computerExternalId}`,
  });
  return {
    published: true as const,
    status: "pending" as const,
    cycleId: args.cycleId,
    targetFloorId: args.socketDevice.floorId,
    targetPosition,
    nextAttemptAt: args.occurredAt,
  };
};

export const invalidateProjectionTarget = async (
  ctx: MutationCtx,
  siteId: string,
  computerExternalId: string,
) => {
  const projection = await ctx.db
    .query("computerProjections")
    .withIndex("by_site_computer", (q) =>
      q.eq("siteId", siteId).eq("computerExternalId", computerExternalId),
    )
    .unique();
  if (projection) await ctx.db.delete(projection._id);
};

const projectionRow = async (
  ctx: ReadCtx,
  siteId: string,
  computerExternalId: string,
) =>
  await ctx.db
    .query("computerProjections")
    .withIndex("by_site_computer", (q) =>
      q.eq("siteId", siteId).eq("computerExternalId", computerExternalId),
    )
    .unique();

const connectedLinks = async (ctx: ReadCtx, deviceId: string) => {
  const [from, to] = await Promise.all([
    ctx.db
      .query("links")
      .withIndex("by_from_device", (q) => q.eq("fromDeviceId", deviceId))
      .first(),
    ctx.db
      .query("links")
      .withIndex("by_to_device", (q) => q.eq("toDeviceId", deviceId))
      .first(),
  ]);
  return Boolean(from || to);
};

const scheduleExecution = async (
  ctx: MutationCtx,
  projection: Doc<"computerProjections">,
  leaseId: string,
  now: number,
) => {
  const fence = projection.fence + 1;
  await ctx.db.patch(projection._id, {
    state: "running",
    fence,
    leaseId,
    leaseExpiresAt: now + LEASE_MS,
    attemptCount: projection.attemptCount + 1,
    nextAttemptAt: undefined,
    errorCode: undefined,
    updatedAt: now,
  });
  const location = await ctx.db
    .query("computerLocations")
    .withIndex("by_site_computer", (q) =>
      q
        .eq("siteId", projection.siteId)
        .eq("computerExternalId", projection.computerExternalId),
    )
    .unique();
  if (location?.projectionCycleId === projection.cycleId) {
    await ctx.db.patch(location._id, {
      projectionStatus: "running",
      projectionTargetFloorId: projection.targetFloorId,
      projectionTargetPosition: projection.targetPosition,
      projectionErrorCode: undefined,
      projectionNextAttemptAt: undefined,
      updatedAt: Math.max(location.updatedAt, now),
    });
    await bumpComputerPresentationRevision(
      ctx,
      location.siteId,
      location.computerExternalId,
      now,
    );
  }
  await ctx.scheduler.runAfter(0, internal.computerProjection.execute, {
    siteId: projection.siteId,
    computerExternalId: projection.computerExternalId,
    cycleId: projection.cycleId,
    leaseId,
    fence,
  });
  return fence;
};

export const claim = internalMutation({
  args: {
    siteId: v.string(),
    computerExternalId: v.string(),
    cycleId: v.string(),
    leaseId: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("claimed"),
      v.literal("ignored"),
      v.literal("stale"),
    ),
    fence: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const projection = await projectionRow(
      ctx,
      args.siteId,
      args.computerExternalId,
    );
    if (!projection || projection.cycleId !== args.cycleId) {
      return { status: "stale" as const };
    }
    const now = Date.now();
    const due =
      (projection.state === "pending" || projection.state === "error") &&
      projection.nextAttemptAt !== undefined &&
      projection.nextAttemptAt <= now;
    const abandoned =
      projection.state === "running" && (projection.leaseExpiresAt ?? 0) <= now;
    if (!due && !abandoned) return { status: "ignored" as const };
    const fence = await scheduleExecution(ctx, projection, args.leaseId, now);
    return { status: "claimed" as const, fence };
  },
});

const failProjection = async (
  ctx: MutationCtx,
  projection: Doc<"computerProjections">,
  location: Doc<"computerLocations">,
  errorCode: string,
  blocked = false,
) => {
  const now = Date.now();
  const retryDelay =
    projection.attemptCount <= RETRY_DELAYS_MS.length
      ? RETRY_DELAYS_MS[projection.attemptCount - 1]
      : undefined;
  await ctx.db.patch(projection._id, {
    state: blocked ? "blocked" : "error",
    leaseId: undefined,
    leaseExpiresAt: undefined,
    nextAttemptAt: blocked
      ? now + BLOCKED_RECHECK_MS
      : retryDelay === undefined
        ? undefined
        : now + retryDelay,
    errorCode,
    updatedAt: now,
  });
  await ctx.db.patch(location._id, {
    projectionStatus: blocked ? "blocked" : "error",
    projectionTargetFloorId: projection.targetFloorId,
    projectionTargetPosition: projection.targetPosition,
    projectionErrorCode: errorCode,
    projectionNextAttemptAt: blocked
      ? now + BLOCKED_RECHECK_MS
      : retryDelay === undefined
        ? undefined
        : now + retryDelay,
    updatedAt: Math.max(location.updatedAt, now),
  });
  await bumpComputerPresentationRevision(
    ctx,
    location.siteId,
    location.computerExternalId,
    now,
  );
  return blocked ? "blocked" : "error";
};

const automaticDeviceId = (
  siteId: string,
  instanceKey: string,
  externalId: string,
): string =>
  `device:auto:${encodeURIComponent(siteId)}:${encodeURIComponent(instanceKey)}:${encodeURIComponent(externalId)}`;

export const execute = internalMutation({
  args: {
    siteId: v.string(),
    computerExternalId: v.string(),
    cycleId: v.string(),
    leaseId: v.string(),
    fence: v.number(),
  },
  returns: v.union(
    v.literal("success"),
    v.literal("blocked"),
    v.literal("error"),
    v.literal("stale"),
  ),
  handler: async (ctx, args) => {
    const projection = await projectionRow(
      ctx,
      args.siteId,
      args.computerExternalId,
    );
    const now = Date.now();
    if (
      !projection ||
      projection.cycleId !== args.cycleId ||
      projection.state !== "running" ||
      projection.fence !== args.fence ||
      projection.leaseId !== args.leaseId ||
      (projection.leaseExpiresAt ?? 0) < now
    ) {
      return "stale";
    }
    const location = await ctx.db
      .query("computerLocations")
      .withIndex("by_site_computer", (q) =>
        q
          .eq("siteId", args.siteId)
          .eq("computerExternalId", args.computerExternalId),
      )
      .unique();
    if (
      !location ||
      location.projectionCycleId !== args.cycleId ||
      location.state !== "online" ||
      location.socketExternalId !== projection.socketExternalId
    ) {
      return "stale";
    }
    const socketBinding = await ctx.db
      .query("externalObjectBindings")
      .withIndex("by_external", (q) =>
        q
          .eq("siteId", args.siteId)
          .eq("provider", "netbox")
          .eq("instanceKey", projection.computer.instanceKey)
          .eq("externalId", projection.socketExternalId),
      )
      .collect();
    const socket =
      socketBinding.length === 1
        ? await getDevice(ctx, socketBinding[0]?.deviceId)
        : null;
    if (
      !socket ||
      socket.type !== "wall-port" ||
      socket.objectId !== projection.socketDeviceId ||
      socketBinding[0]?.floorId !== socket.floorId
    ) {
      return await failProjection(
        ctx,
        projection,
        location,
        "invalid_socket_binding",
      );
    }
    const binding = await computerBinding(
      ctx,
      args.siteId,
      projection.computer.instanceKey,
      args.computerExternalId,
    );
    if (binding === "duplicate") {
      return await failProjection(
        ctx,
        projection,
        location,
        "duplicate_external_binding",
      );
    }
    const existing = binding ? await getDevice(ctx, binding.deviceId) : null;
    const targetFloorId = socket.floorId;
    const placement = await findPlacement(
      ctx,
      targetFloorId,
      socket,
      existing?.size ?? PC_SIZE,
      existing?.objectId,
    );
    if (!("position" in placement)) {
      return await failProjection(
        ctx,
        projection,
        location,
        placement.errorCode,
      );
    }

    const deviceId =
      existing?.objectId ??
      automaticDeviceId(
        args.siteId,
        projection.computer.instanceKey,
        args.computerExternalId,
      );
    const relocation = await applyIntegrationDeviceRelocation(ctx, {
      kind: "system.device.relocate",
      origin: "integration",
      operationId: `projection:${args.cycleId}:${args.computerExternalId}:${args.fence}`,
      expectedCycleId: args.cycleId,
      expectedFence: args.fence,
      siteId: args.siteId,
      computerExternalId: args.computerExternalId,
      device: {
        id: deviceId,
        name: projection.computer.name,
        hostname: projection.computer.hostname,
        size: existing?.size ?? PC_SIZE,
        metadata: {
          ip: projection.computer.ip,
          model: projection.computer.model,
          source: {
            provider: "netbox",
            siteId: args.siteId,
            instanceKey: projection.computer.instanceKey,
            externalId: args.computerExternalId,
            url: projection.computer.url,
            location: projection.computer.location,
            locationPath: projection.computer.locationPath,
            role: projection.computer.role,
            lifecycleStatus: projection.computer.lifecycleStatus,
            syncedAt: projection.computer.syncedAt,
          },
        },
      },
      source:
        projection.sourceFloorId && projection.sourcePosition
          ? {
              floorId: projection.sourceFloorId,
              position: projection.sourcePosition,
            }
          : null,
      target: {
        floorId: targetFloorId,
        position: placement.position,
      },
      occurredAt: now,
    });
    if (relocation.status === "rejected") {
      const errorCode = (relocation.reason ?? "relocation_rejected").replaceAll(
        "-",
        "_",
      );
      return await failProjection(
        ctx,
        projection,
        location,
        errorCode,
        relocation.reason === "blocked-by-links",
      );
    }
    await ctx.db.patch(projection._id, {
      state: "success",
      leaseId: undefined,
      leaseExpiresAt: undefined,
      nextAttemptAt: undefined,
      errorCode: undefined,
      targetFloorId,
      targetPosition: placement.position,
      completedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(location._id, {
      projectionStatus: "success",
      projectionTargetFloorId: targetFloorId,
      projectionTargetPosition: placement.position,
      projectionErrorCode: undefined,
      projectionNextAttemptAt: undefined,
      lastKnownFloorId: targetFloorId,
      lastKnownPosition: placement.position,
      lastProjectedCycleId: args.cycleId,
      updatedAt: Math.max(location.updatedAt, now),
    });
    if (relocation.floors.length === 0) {
      await bumpComputerPresentationRevision(
        ctx,
        location.siteId,
        location.computerExternalId,
        now,
      );
    }
    return "success";
  },
});

const blockedCanRetry = async (
  ctx: ReadCtx,
  projection: Doc<"computerProjections">,
) => {
  if (!projection.sourceFloorId) return true;
  const binding = await computerBinding(
    ctx,
    projection.siteId,
    projection.computer.instanceKey,
    projection.computerExternalId,
  );
  return Boolean(
    binding &&
    binding !== "duplicate" &&
    !(await connectedLinks(ctx, binding.deviceId)),
  );
};

export const expireVisuals = async (ctx: MutationCtx, now: number) => {
  const rows = await ctx.db
    .query("computerLocations")
    .withIndex("by_state_expiry_pending", (q) =>
      q
        .eq("state", "offline")
        .eq("expiredAt", undefined)
        .gt("visualExpiresAt", 0)
        .lte("visualExpiresAt", now),
    )
    .take(SWEEP_PART_SIZE);
  for (const location of rows) {
    if (location.visualExpiresAt === undefined) continue;
    await ctx.db.patch(location._id, {
      expiredAt: now,
      projectionStatus: "idle",
      projectionCycleId: undefined,
      projectionTargetFloorId: undefined,
      projectionTargetPosition: undefined,
      projectionErrorCode: undefined,
      projectionNextAttemptAt: undefined,
      updatedAt: Math.max(location.updatedAt, now),
    });
    await ctx.db.insert("localizationEvents", {
      siteId: location.siteId,
      computerExternalId: location.computerExternalId,
      cycleId: `expiry:${location.visualExpiresAt}`,
      kind: "expired",
      occurredAt: now,
      fromSocketExternalId: location.lastConfirmedSocketExternalId,
      reason: "visual_retention_elapsed",
    });
    await invalidateProjectionTarget(
      ctx,
      location.siteId,
      location.computerExternalId,
    );
    await bumpComputerPresentationRevision(
      ctx,
      location.siteId,
      location.computerExternalId,
      now,
    );
  }
  return rows.length;
};

export const sweep = internalMutation({
  args: {},
  returns: v.object({
    claimed: v.number(),
    expired: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const [pending, errors, abandoned, blocked] = await Promise.all([
      ctx.db
        .query("computerProjections")
        .withIndex("by_state_due", (q) =>
          q
            .eq("state", "pending")
            .gt("nextAttemptAt", 0)
            .lte("nextAttemptAt", now),
        )
        .take(SWEEP_PART_SIZE),
      ctx.db
        .query("computerProjections")
        .withIndex("by_state_due", (q) =>
          q
            .eq("state", "error")
            .gt("nextAttemptAt", 0)
            .lte("nextAttemptAt", now),
        )
        .take(SWEEP_PART_SIZE),
      ctx.db
        .query("computerProjections")
        .withIndex("by_state_lease", (q) =>
          q
            .eq("state", "running")
            .gt("leaseExpiresAt", 0)
            .lte("leaseExpiresAt", now),
        )
        .take(SWEEP_PART_SIZE),
      ctx.db
        .query("computerProjections")
        .withIndex("by_state_due", (q) =>
          q
            .eq("state", "blocked")
            .gt("nextAttemptAt", 0)
            .lte("nextAttemptAt", now),
        )
        .take(SWEEP_PART_SIZE),
    ]);
    let claimed = 0;
    for (const projection of [...pending, ...errors, ...abandoned]) {
      await scheduleExecution(
        ctx,
        projection,
        `sweep:${now}:${projection._id}`,
        now,
      );
      claimed += 1;
    }
    for (const projection of blocked) {
      if (!(await blockedCanRetry(ctx, projection))) {
        const nextAttemptAt = now + BLOCKED_RECHECK_MS;
        await ctx.db.patch(projection._id, {
          nextAttemptAt,
          updatedAt: now,
        });
        const location = await ctx.db
          .query("computerLocations")
          .withIndex("by_site_computer", (q) =>
            q
              .eq("siteId", projection.siteId)
              .eq("computerExternalId", projection.computerExternalId),
          )
          .unique();
        if (location?.projectionCycleId === projection.cycleId) {
          await ctx.db.patch(location._id, {
            projectionNextAttemptAt: nextAttemptAt,
            updatedAt: Math.max(location.updatedAt, now),
          });
          await bumpComputerPresentationRevision(
            ctx,
            location.siteId,
            location.computerExternalId,
            now,
          );
        }
        continue;
      }
      await ctx.db.patch(projection._id, {
        state: "pending",
        nextAttemptAt: now,
        errorCode: undefined,
        updatedAt: now,
      });
      const refreshed = await ctx.db.get(projection._id);
      if (!refreshed) continue;
      await scheduleExecution(
        ctx,
        refreshed,
        `unblocked:${now}:${projection._id}`,
        now,
      );
      claimed += 1;
    }
    const expired = await expireVisuals(ctx, now);
    return { claimed, expired };
  },
});
