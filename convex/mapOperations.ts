import type { Infer } from "convex/values";
import { mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mapOperation, mapOperationResult } from "./mapValidators";

type OperationInput = Infer<typeof mapOperation>;
type DeviceCreateOperation = Extract<OperationInput, { kind: "device.create" }>;
type DevicePatchOperation = Extract<OperationInput, { kind: "device.patch" }>;
type DeviceDeleteOperation = Extract<OperationInput, { kind: "device.delete" }>;
type WallAddOperation = Extract<OperationInput, { kind: "walls.add" }>;
type WallDeleteOperation = Extract<OperationInput, { kind: "walls.delete" }>;
type LinkCreateOperation = Extract<OperationInput, { kind: "link.create" }>;
type LinkDeleteOperation = Extract<OperationInput, { kind: "link.delete" }>;

type DeviceInput = DeviceCreateOperation["device"];
type WallInput = WallAddOperation["walls"][number];
type LinkInput = LinkCreateOperation["link"];

type DeviceInsert = Omit<Doc<"devices">, "_id" | "_creationTime">;
type WallInsert = Omit<Doc<"walls">, "_id" | "_creationTime">;
type LinkInsert = Omit<Doc<"links">, "_id" | "_creationTime">;

type DevicePatch = Pick<
  Doc<"devices">,
  | "name"
  | "hostname"
  | "position"
  | "size"
  | "metadata"
  | "updatedAt"
  | "updatedBy"
>;
type PresencePatch = {
  selectedDeviceId?: string;
  selectedObjectIds?: Array<string>;
};

type PlannedDevice = DeviceInsert & { rowId?: Id<"devices"> };
type PlannedWall = WallInsert & { rowId?: Id<"walls"> };
type PlannedLink = LinkInsert & { rowId?: Id<"links"> };
type PlannedPresence = Doc<"presences">;

type WritePlan = Array<
  | { kind: "insertDevice"; value: DeviceInsert }
  | { kind: "patchDevice"; rowId: Id<"devices">; value: DevicePatch }
  | { kind: "deleteDevice"; rowId: Id<"devices"> }
  | { kind: "insertWall"; value: WallInsert }
  | { kind: "deleteWall"; rowId: Id<"walls"> }
  | { kind: "insertLink"; value: LinkInsert }
  | { kind: "deleteLink"; rowId: Id<"links"> }
  | { kind: "patchPresence"; rowId: Id<"presences">; value: PresencePatch }
>;

interface PlanningState {
  floors: Set<string>;
  devices: Map<string, PlannedDevice>;
  walls: Map<string, PlannedWall>;
  links: Map<string, PlannedLink>;
  presences: Map<Id<"presences">, PlannedPresence>;
  wallGeometry: Map<string, string>;
  affectedFloorIds: Set<string>;
  plan: WritePlan;
}

const GRID_SIZE = 20;
const WALL_THICKNESS = GRID_SIZE;
const MAX_BATCH_OPERATIONS = 100;
const MAX_WALLS_PER_OPERATION = 500;

const sameJson = (left: object, right: object): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const rectanglesOverlap = (
  pos1: { x: number; y: number },
  size1: { width: number; height: number },
  pos2: { x: number; y: number },
  size2: { width: number; height: number },
): boolean => {
  return !(
    pos1.x + size1.width <= pos2.x ||
    pos2.x + size2.width <= pos1.x ||
    pos1.y + size1.height <= pos2.y ||
    pos2.y + size2.height <= pos1.y
  );
};

const arePositionsEqual = (
  left: { x: number; y: number },
  right: { x: number; y: number },
): boolean => left.x === right.x && left.y === right.y;

const isFiniteNonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

const validatePosition = (position: {
  x: number;
  y: number;
}): string | null => {
  if (!isFiniteNonNegative(position.x) || !isFiniteNonNegative(position.y)) {
    return "Position must contain finite non-negative numbers";
  }
  return null;
};

const validateSize = (size: {
  width: number;
  height: number;
}): string | null => {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return "Size must contain finite numbers";
  }
  if (size.width <= 0 || size.height <= 0) {
    return "Size must be greater than zero";
  }
  return null;
};

const validateDeviceShape = (
  device: Pick<PlannedDevice, "position" | "size">,
): string | null =>
  validatePosition(device.position) ?? validateSize(device.size);

const normalizeWallBlockPoints = (
  start: { x: number; y: number },
  end: { x: number; y: number },
): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} | null => {
  if (start.x !== end.x && start.y !== end.y) return null;
  if (arePositionsEqual(start, end)) return { start, end };

  if (start.y === end.y) {
    return start.x <= end.x ? { start, end } : { start: end, end: start };
  }

  return start.y <= end.y ? { start, end } : { start: end, end: start };
};

const canonicalWall = (wall: WallInput): WallInput | null => {
  const normalized = normalizeWallBlockPoints(wall.start, wall.end);
  if (!normalized) return null;
  const geometryKey = `${normalized.start.x}:${normalized.start.y}:${normalized.end.x}:${normalized.end.y}`;
  if (wall.geometryKey !== geometryKey) return null;
  if (validatePosition(normalized.start) || validatePosition(normalized.end)) {
    return null;
  }
  return { ...wall, ...normalized, geometryKey };
};

const getWallCollisionRect = (wall: Pick<WallInput, "start" | "end">) => {
  if (arePositionsEqual(wall.start, wall.end)) {
    return {
      x: wall.start.x - GRID_SIZE / 2,
      y: wall.start.y - GRID_SIZE / 2,
      width: GRID_SIZE,
      height: GRID_SIZE,
    };
  }

  if (wall.start.y === wall.end.y) {
    const minX = Math.min(wall.start.x, wall.end.x);
    const length = Math.abs(wall.end.x - wall.start.x);
    return {
      x: minX,
      y: wall.start.y - WALL_THICKNESS / 2,
      width: length,
      height: WALL_THICKNESS,
    };
  }

  const minY = Math.min(wall.start.y, wall.end.y);
  const length = Math.abs(wall.end.y - wall.start.y);
  return {
    x: wall.start.x - WALL_THICKNESS / 2,
    y: minY,
    width: WALL_THICKNESS,
    height: length,
  };
};

const devicePayload = (device: DeviceInput) => ({
  id: device.id,
  floorId: device.floorId,
  type: device.type,
  name: device.name,
  hostname: device.hostname,
  position: device.position,
  size: device.size,
  metadata: device.metadata,
});

const plannedDevicePayload = (device: PlannedDevice) => ({
  id: device.objectId,
  floorId: device.floorId,
  type: device.type,
  name: device.name,
  hostname: device.hostname,
  position: device.position,
  size: device.size,
  metadata: device.metadata,
});

const wallPayload = (wall: WallInput) => ({
  id: wall.id,
  floorId: wall.floorId,
  start: wall.start,
  end: wall.end,
  color: wall.color,
  geometryKey: wall.geometryKey,
});

const plannedWallPayload = (wall: PlannedWall) => ({
  id: wall.objectId,
  floorId: wall.floorId,
  start: wall.start,
  end: wall.end,
  color: wall.color,
  geometryKey: wall.geometryKey,
});

const linkPayload = (link: LinkInput) => ({
  id: link.id,
  floorId: link.floorId,
  fromDeviceId: link.fromDeviceId,
  fromPort: link.fromPort,
  toDeviceId: link.toDeviceId,
  toPort: link.toPort,
  label: link.label,
});

const plannedLinkPayload = (link: PlannedLink) => ({
  id: link.objectId,
  floorId: link.floorId,
  fromDeviceId: link.fromDeviceId,
  fromPort: link.fromPort,
  toDeviceId: link.toDeviceId,
  toPort: link.toPort,
  label: link.label,
});

const wallGeometryKey = (floorId: string, geometryKey: string): string =>
  `${floorId}:${geometryKey}`;

const buildPlanningState = async (ctx: MutationCtx): Promise<PlanningState> => {
  const [floors, devices, walls, links, presences] = await Promise.all([
    ctx.db.query("floors").collect(),
    ctx.db.query("devices").collect(),
    ctx.db.query("walls").collect(),
    ctx.db.query("links").collect(),
    ctx.db.query("presences").collect(),
  ]);

  return {
    floors: new Set(floors.map((floor) => floor.objectId)),
    devices: new Map(
      devices.map((device) => [
        device.objectId,
        {
          rowId: device._id,
          objectId: device.objectId,
          floorId: device.floorId,
          type: device.type,
          name: device.name,
          hostname: device.hostname,
          position: device.position,
          size: device.size,
          metadata: device.metadata,
          updatedAt: device.updatedAt,
          updatedBy: device.updatedBy,
        },
      ]),
    ),
    walls: new Map(
      walls.map((wall) => [
        wall.objectId,
        {
          rowId: wall._id,
          objectId: wall.objectId,
          floorId: wall.floorId,
          start: wall.start,
          end: wall.end,
          color: wall.color,
          geometryKey: wall.geometryKey,
          updatedAt: wall.updatedAt,
          updatedBy: wall.updatedBy,
        },
      ]),
    ),
    links: new Map(
      links.map((link) => [
        link.objectId,
        {
          rowId: link._id,
          objectId: link.objectId,
          floorId: link.floorId,
          fromDeviceId: link.fromDeviceId,
          fromPort: link.fromPort,
          toDeviceId: link.toDeviceId,
          toPort: link.toPort,
          label: link.label,
          updatedAt: link.updatedAt,
          updatedBy: link.updatedBy,
        },
      ]),
    ),
    presences: new Map(presences.map((presence) => [presence._id, presence])),
    wallGeometry: new Map(
      walls.map((wall) => [
        wallGeometryKey(wall.floorId, wall.geometryKey),
        wall.objectId,
      ]),
    ),
    affectedFloorIds: new Set(),
    plan: [],
  };
};

const markAffectedFloor = (state: PlanningState, floorId: string) => {
  state.affectedFloorIds.add(floorId);
};

const floorError = (state: PlanningState, floorId: string): string | null =>
  state.floors.has(floorId) ? null : "Floor not found";

const removePlannedInsert = (
  state: PlanningState,
  kind: "insertDevice" | "insertWall" | "insertLink",
  objectId: string,
) => {
  state.plan = state.plan.filter((write) => {
    if (write.kind !== kind) return true;
    return write.value.objectId !== objectId;
  });
};

const updatePlannedDeviceInsert = (
  state: PlanningState,
  device: PlannedDevice,
) => {
  for (const write of state.plan) {
    if (
      write.kind === "insertDevice" &&
      write.value.objectId === device.objectId
    ) {
      write.value.name = device.name;
      write.value.hostname = device.hostname;
      write.value.position = device.position;
      write.value.size = device.size;
      write.value.metadata = device.metadata;
      write.value.updatedAt = device.updatedAt;
      write.value.updatedBy = device.updatedBy;
      return;
    }
  }
};

const validateDevicePlacement = (
  state: PlanningState,
  device: Pick<PlannedDevice, "objectId" | "floorId" | "position" | "size">,
): string | null => {
  const shapeError = validateDeviceShape(device);
  if (shapeError) return shapeError;

  for (const other of state.devices.values()) {
    if (other.objectId === device.objectId) continue;
    if (other.floorId !== device.floorId) continue;
    if (
      rectanglesOverlap(
        device.position,
        device.size,
        other.position,
        other.size,
      )
    ) {
      return "Device collides with another device";
    }
  }

  for (const wall of state.walls.values()) {
    if (wall.floorId !== device.floorId) continue;
    const rect = getWallCollisionRect(wall);
    if (
      rectanglesOverlap(
        device.position,
        device.size,
        { x: rect.x, y: rect.y },
        { width: rect.width, height: rect.height },
      )
    ) {
      return "Device collides with a wall";
    }
  }

  return null;
};

const wallCollidesWithDevice = (
  state: PlanningState,
  wall: WallInput,
): boolean => {
  const rect = getWallCollisionRect(wall);
  for (const device of state.devices.values()) {
    if (device.floorId !== wall.floorId) continue;
    if (
      rectanglesOverlap(
        { x: rect.x, y: rect.y },
        { width: rect.width, height: rect.height },
        device.position,
        device.size,
      )
    ) {
      return true;
    }
  }

  return false;
};

const planDeviceCreate = (
  state: PlanningState,
  operation: DeviceCreateOperation,
): string | null => {
  const existingFloorError = floorError(state, operation.device.floorId);
  if (existingFloorError) return existingFloorError;
  const shapeError = validateDeviceShape(operation.device);
  if (shapeError) return shapeError;

  const existing = state.devices.get(operation.device.id);
  if (existing) {
    markAffectedFloor(state, existing.floorId);
    return sameJson(
      plannedDevicePayload(existing),
      devicePayload(operation.device),
    )
      ? null
      : "Device object id already exists with different payload";
  }

  const placementError = validateDevicePlacement(state, {
    objectId: operation.device.id,
    floorId: operation.device.floorId,
    position: operation.device.position,
    size: operation.device.size,
  });
  if (placementError) return placementError;

  const value: DeviceInsert = {
    objectId: operation.device.id,
    floorId: operation.device.floorId,
    type: operation.device.type,
    name: operation.device.name,
    hostname: operation.device.hostname,
    position: operation.device.position,
    size: operation.device.size,
    metadata: operation.device.metadata,
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  state.devices.set(operation.device.id, value);
  markAffectedFloor(state, operation.device.floorId);
  state.plan.push({ kind: "insertDevice", value });
  return null;
};

const planDevicePatch = (
  state: PlanningState,
  operation: DevicePatchOperation,
): string | null => {
  const existing = state.devices.get(operation.deviceId);
  if (!existing) return "Device not found";

  const patched: PlannedDevice = {
    ...existing,
    name: operation.patch.name ?? existing.name,
    hostname:
      operation.patch.hostname === undefined
        ? existing.hostname
        : operation.patch.hostname,
    position: operation.patch.position ?? existing.position,
    size: operation.patch.size ?? existing.size,
    metadata: operation.patch.metadata ?? existing.metadata,
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };

  const placementError = validateDevicePlacement(state, patched);
  if (placementError) return placementError;

  state.devices.set(operation.deviceId, patched);
  markAffectedFloor(state, patched.floorId);
  if (existing.rowId) {
    state.plan.push({
      kind: "patchDevice",
      rowId: existing.rowId,
      value: {
        name: patched.name,
        hostname: patched.hostname,
        position: patched.position,
        size: patched.size,
        metadata: patched.metadata,
        updatedAt: patched.updatedAt,
        updatedBy: patched.updatedBy,
      },
    });
  } else {
    updatePlannedDeviceInsert(state, patched);
  }

  return null;
};

const planPresenceSelectionClear = (state: PlanningState, deviceId: string) => {
  for (const presence of state.presences.values()) {
    const selectedObjectIds = presence.selectedObjectIds?.filter(
      (objectId) => objectId !== deviceId,
    );
    if (
      presence.selectedDeviceId !== deviceId &&
      selectedObjectIds?.length === presence.selectedObjectIds?.length
    ) {
      continue;
    }

    const patch: PresencePatch = {
      selectedDeviceId:
        presence.selectedDeviceId === deviceId
          ? undefined
          : presence.selectedDeviceId,
      selectedObjectIds,
    };
    state.presences.set(presence._id, { ...presence, ...patch });
    state.plan.push({
      kind: "patchPresence",
      rowId: presence._id,
      value: patch,
    });
  }
};

const planLinkDeleteById = (state: PlanningState, linkId: string) => {
  const existing = state.links.get(linkId);
  if (!existing) return;

  state.links.delete(linkId);
  markAffectedFloor(state, existing.floorId);
  if (existing.rowId) {
    state.plan.push({ kind: "deleteLink", rowId: existing.rowId });
  } else {
    removePlannedInsert(state, "insertLink", linkId);
  }
};

const planDeviceDelete = (
  state: PlanningState,
  operation: DeviceDeleteOperation,
): string | null => {
  const existing = state.devices.get(operation.deviceId);
  if (!existing) return null;

  for (const link of [...state.links.values()]) {
    if (
      link.fromDeviceId === operation.deviceId ||
      link.toDeviceId === operation.deviceId
    ) {
      planLinkDeleteById(state, link.objectId);
    }
  }

  planPresenceSelectionClear(state, operation.deviceId);
  state.devices.delete(operation.deviceId);
  markAffectedFloor(state, existing.floorId);
  if (existing.rowId) {
    state.plan.push({ kind: "deleteDevice", rowId: existing.rowId });
  } else {
    removePlannedInsert(state, "insertDevice", operation.deviceId);
  }
  return null;
};

const planLinkCreate = (
  state: PlanningState,
  operation: LinkCreateOperation,
): string | null => {
  const existingFloorError = floorError(state, operation.link.floorId);
  if (existingFloorError) return existingFloorError;

  const existing = state.links.get(operation.link.id);
  if (existing) {
    markAffectedFloor(state, existing.floorId);
    return sameJson(plannedLinkPayload(existing), linkPayload(operation.link))
      ? null
      : "Link object id already exists with different payload";
  }

  const from = state.devices.get(operation.link.fromDeviceId);
  const to = state.devices.get(operation.link.toDeviceId);
  if (!from || !to) return "Link endpoint not found";
  if (
    from.floorId !== operation.link.floorId ||
    to.floorId !== operation.link.floorId
  ) {
    return "Links must connect devices on the same floor";
  }

  const value: LinkInsert = {
    objectId: operation.link.id,
    floorId: operation.link.floorId,
    fromDeviceId: operation.link.fromDeviceId,
    fromPort: operation.link.fromPort,
    toDeviceId: operation.link.toDeviceId,
    toPort: operation.link.toPort,
    label: operation.link.label,
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  state.links.set(operation.link.id, value);
  markAffectedFloor(state, operation.link.floorId);
  state.plan.push({ kind: "insertLink", value });
  return null;
};

const planLinkDelete = (
  state: PlanningState,
  operation: LinkDeleteOperation,
): string | null => {
  planLinkDeleteById(state, operation.linkId);
  return null;
};

const planWallsAdd = (
  state: PlanningState,
  operation: WallAddOperation,
): string | null => {
  if (operation.walls.length > MAX_WALLS_PER_OPERATION) {
    return "Too many walls in one operation";
  }
  for (const input of operation.walls) {
    const wall = canonicalWall(input);
    if (!wall) return "Invalid wall geometry";

    const existingFloorError = floorError(state, wall.floorId);
    if (existingFloorError) return existingFloorError;

    const existing = state.walls.get(wall.id);
    if (existing) {
      markAffectedFloor(state, existing.floorId);
      if (!sameJson(plannedWallPayload(existing), wallPayload(wall))) {
        return "Wall object id already exists with different payload";
      }
      continue;
    }

    const geometryKey = wallGeometryKey(wall.floorId, wall.geometryKey);
    if (state.wallGeometry.has(geometryKey)) {
      markAffectedFloor(state, wall.floorId);
      continue;
    }

    if (wallCollidesWithDevice(state, wall)) {
      return "Wall collides with a device";
    }

    const value: WallInsert = {
      objectId: wall.id,
      floorId: wall.floorId,
      start: wall.start,
      end: wall.end,
      color: wall.color,
      geometryKey: wall.geometryKey,
      updatedAt: operation.meta.createdAt,
      updatedBy: operation.meta.clientId,
    };
    state.walls.set(wall.id, value);
    state.wallGeometry.set(geometryKey, wall.id);
    markAffectedFloor(state, wall.floorId);
    state.plan.push({ kind: "insertWall", value });
  }

  return null;
};

const planWallDeleteById = (state: PlanningState, wallId: string) => {
  const existing = state.walls.get(wallId);
  if (!existing) return;

  state.walls.delete(wallId);
  markAffectedFloor(state, existing.floorId);
  state.wallGeometry.delete(
    wallGeometryKey(existing.floorId, existing.geometryKey),
  );
  if (existing.rowId) {
    state.plan.push({ kind: "deleteWall", rowId: existing.rowId });
  } else {
    removePlannedInsert(state, "insertWall", wallId);
  }
};

const planWallsDelete = (
  state: PlanningState,
  operation: WallDeleteOperation,
): string | null => {
  for (const wallId of operation.wallIds) planWallDeleteById(state, wallId);
  return null;
};

const planOperation = (
  state: PlanningState,
  operation: OperationInput,
): string | null => {
  switch (operation.kind) {
    case "device.create":
      return planDeviceCreate(state, operation);
    case "device.patch":
      return planDevicePatch(state, operation);
    case "device.delete":
      return planDeviceDelete(state, operation);
    case "link.create":
      return planLinkCreate(state, operation);
    case "link.delete":
      return planLinkDelete(state, operation);
    case "walls.add":
      return planWallsAdd(state, operation);
    case "walls.delete":
      return planWallsDelete(state, operation);
    case "batch": {
      if (operation.operations.length > MAX_BATCH_OPERATIONS) {
        return "Too many operations in one batch";
      }
      for (const subOperation of operation.operations) {
        const error = planOperation(state, {
          ...subOperation,
          meta: operation.meta,
        } as OperationInput);
        if (error) return error;
      }
      return null;
    }
  }
};

const bumpDocumentRevisions = async (
  ctx: MutationCtx,
  floorIds: ReadonlySet<string>,
  now: number,
): Promise<Map<string, number>> => {
  const revisions = new Map<string, number>();
  for (const floorId of floorIds) {
    const existing = await ctx.db
      .query("documentRevisions")
      .withIndex("by_floor", (q) => q.eq("floorId", floorId))
      .unique();
    const revision = (existing?.revision ?? 0) + 1;
    if (existing) {
      await ctx.db.patch(existing._id, { revision, updatedAt: now });
    } else {
      await ctx.db.insert("documentRevisions", {
        floorId,
        revision,
        updatedAt: now,
      });
    }
    revisions.set(floorId, revision);
  }
  return revisions;
};

const executePlan = async (ctx: MutationCtx, plan: WritePlan) => {
  for (const write of plan) {
    switch (write.kind) {
      case "insertDevice":
        await ctx.db.insert("devices", write.value);
        break;
      case "patchDevice":
        await ctx.db.patch(write.rowId, write.value);
        break;
      case "deleteDevice":
        await ctx.db.delete(write.rowId);
        break;
      case "insertWall":
        await ctx.db.insert("walls", write.value);
        break;
      case "deleteWall":
        await ctx.db.delete(write.rowId);
        break;
      case "insertLink":
        await ctx.db.insert("links", write.value);
        break;
      case "deleteLink":
        await ctx.db.delete(write.rowId);
        break;
      case "patchPresence":
        await ctx.db.patch(write.rowId, write.value);
        break;
    }
  }
};

const operationFloorId = (operation: OperationInput): string | undefined => {
  switch (operation.kind) {
    case "device.create":
      return operation.device.floorId;
    case "link.create":
      return operation.link.floorId;
    case "walls.add":
      return operation.walls[0]?.floorId;
    case "batch":
      return operation.operations[0]
        ? operationFloorId({
            ...operation.operations[0],
            meta: operation.meta,
          } as OperationInput)
        : undefined;
    case "device.patch":
    case "device.delete":
    case "link.delete":
    case "walls.delete":
      return undefined;
  }
};

export const apply = mutation({
  args: { operation: mapOperation },
  returns: mapOperationResult,
  handler: async (ctx, { operation }) => {
    const existing = await ctx.db
      .query("clientOperations")
      .withIndex("by_op_id", (q) => q.eq("opId", operation.meta.opId))
      .unique();
    if (existing) {
      return {
        status: existing.status,
        opId: existing.opId,
        appliedRevision: existing.appliedRevision,
        floorId: existing.floorId,
        error: existing.error,
      };
    }

    const now = Date.now();
    const planningOperation = {
      ...operation,
      meta: { ...operation.meta, createdAt: now },
    } as OperationInput;
    const state = await buildPlanningState(ctx);
    const error = planOperation(state, planningOperation);
    const status: "applied" | "rejected" = error ? "rejected" : "applied";
    let appliedRevision: number | undefined;
    let floorId = operationFloorId(operation);
    if (!error) {
      await executePlan(ctx, state.plan);
      const revisions = await bumpDocumentRevisions(
        ctx,
        state.affectedFloorIds,
        now,
      );
      floorId = floorId ?? state.affectedFloorIds.values().next().value;
      appliedRevision = floorId ? revisions.get(floorId) : 0;
    }

    await ctx.db.insert("clientOperations", {
      opId: operation.meta.opId,
      clientId: operation.meta.clientId,
      clientSeq: operation.meta.clientSeq,
      floorId,
      kind: operation.kind,
      status,
      error: error ?? undefined,
      appliedRevision,
      createdAt: operation.meta.createdAt,
      appliedAt: now,
    });

    return {
      status,
      opId: operation.meta.opId,
      appliedRevision,
      floorId,
      error: error ?? undefined,
    };
  },
});
