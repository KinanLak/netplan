import type { Infer } from "convex/values";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mapOperation, mapOperationResult } from "./mapValidators";
import { getExpiredDeviceIdsForFloor } from "./computerPresentation";
import { applySystemDeviceRelocation } from "../src/map-engine/systemDeviceRelocation";
import type {
  Device,
  DeviceId,
  FloorId,
  LinkId,
  MapDocumentSnapshot,
  WallId,
} from "../src/types/map";

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
type BindingInsert = Omit<
  Doc<"externalObjectBindings">,
  "_id" | "_creationTime"
>;

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
type PlannedDevice = DeviceInsert & { rowId?: Id<"devices"> };
type PlannedWall = WallInsert & { rowId?: Id<"walls"> };
type PlannedLink = LinkInsert & { rowId?: Id<"links"> };
type PlannedBinding = BindingInsert & {
  rowId?: Id<"externalObjectBindings">;
};

type WritePlan = Array<
  | { kind: "insertDevice"; value: DeviceInsert }
  | { kind: "patchDevice"; rowId: Id<"devices">; value: DevicePatch }
  | { kind: "deleteDevice"; rowId: Id<"devices"> }
  | { kind: "insertWall"; value: WallInsert }
  | { kind: "deleteWall"; rowId: Id<"walls"> }
  | { kind: "insertLink"; value: LinkInsert }
  | { kind: "deleteLink"; rowId: Id<"links"> }
  | { kind: "insertBinding"; value: BindingInsert }
  | { kind: "deleteBinding"; rowId: Id<"externalObjectBindings"> }
>;

interface PlanningState {
  floors: Set<string>;
  devices: Map<string, PlannedDevice>;
  walls: Map<string, PlannedWall>;
  links: Map<string, PlannedLink>;
  siteIdByFloor: Map<string, string>;
  netboxInstanceKeyBySite: Map<string, string>;
  validExternalKeys: Set<string>;
  bindingsByKey: Map<string, PlannedBinding>;
  bindingKeyByDevice: Map<string, string>;
  wallGeometry: Map<string, string>;
  collisionExcludedDeviceIds: Set<string>;
  affectedFloorIds: Set<string>;
  plan: WritePlan;
}

const GRID_SIZE = 20;
const WALL_THICKNESS = GRID_SIZE;
const MAX_BATCH_OPERATIONS = 100;
const MAX_WALLS_PER_OPERATION = 500;
const MAX_WALL_DELETES_PER_OPERATION = 500;
const MAX_OBSERVED_PENDING_OP_IDS = 100;

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

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const validatePosition = (position: {
  x: number;
  y: number;
}): string | null => {
  if (!isFiniteNumber(position.x) || !isFiniteNumber(position.y)) {
    return "Position must contain finite numbers";
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

interface OperationScope {
  floorIds: Set<string>;
  deviceIds: Set<string>;
  wallIds: Set<string>;
  linkIds: Set<string>;
  externalIdentities: Map<
    string,
    { siteId: string; instanceKey: string; externalId: string }
  >;
}

const externalBindingKey = (identity: {
  siteId: string;
  instanceKey: string;
  externalId: string;
}): string =>
  `${identity.siteId}\0netbox\0${identity.instanceKey}\0${identity.externalId}`;

const collectExternalIdentity = (
  scope: OperationScope,
  source: DeviceInput["metadata"]["source"],
) => {
  if (!source) return;
  scope.externalIdentities.set(externalBindingKey(source), {
    siteId: source.siteId,
    instanceKey: source.instanceKey,
    externalId: source.externalId,
  });
};

/**
 * Object ids and floors an operation can touch, collected before planning so
 * the mutation only reads the affected floor(s) instead of the whole
 * database (which would also make every mutation conflict with every other).
 */
const collectOperationScope = (
  operation: OperationInput,
  scope: OperationScope = {
    floorIds: new Set(),
    deviceIds: new Set(),
    wallIds: new Set(),
    linkIds: new Set(),
    externalIdentities: new Map(),
  },
): OperationScope => {
  switch (operation.kind) {
    case "device.create":
      scope.floorIds.add(operation.device.floorId);
      scope.deviceIds.add(operation.device.id);
      collectExternalIdentity(scope, operation.device.metadata.source);
      break;
    case "device.patch":
      collectExternalIdentity(scope, operation.patch.metadata?.source);
      scope.deviceIds.add(operation.deviceId);
      break;
    case "device.delete":
      scope.deviceIds.add(operation.deviceId);
      break;
    case "link.create":
      scope.floorIds.add(operation.link.floorId);
      scope.linkIds.add(operation.link.id);
      scope.deviceIds.add(operation.link.fromDeviceId);
      scope.deviceIds.add(operation.link.toDeviceId);
      break;
    case "link.delete":
      scope.linkIds.add(operation.linkId);
      break;
    case "walls.add":
      // Created wall ids are covered by loading their declared floor;
      // replayed operations are already deduplicated by opId upstream.
      for (const wall of operation.walls) scope.floorIds.add(wall.floorId);
      break;
    case "walls.delete":
      for (const wallId of operation.wallIds) scope.wallIds.add(wallId);
      break;
    case "batch":
      for (const subOperation of operation.operations) {
        collectOperationScope({ ...subOperation, meta: operation.meta }, scope);
      }
      break;
  }
  return scope;
};

const buildPlanningState = async (
  ctx: MutationCtx,
  operation: OperationInput,
): Promise<PlanningState> => {
  const scope = collectOperationScope(operation);

  // Resolve the floors of referenced objects through point lookups, then
  // load only those floors' rows.
  const [deviceRefs, wallRefs, linkRefs] = await Promise.all([
    Promise.all(
      [...scope.deviceIds].map((objectId) =>
        ctx.db
          .query("devices")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
      ),
    ),
    Promise.all(
      [...scope.wallIds].map((objectId) =>
        ctx.db
          .query("walls")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
      ),
    ),
    Promise.all(
      [...scope.linkIds].map((objectId) =>
        ctx.db
          .query("links")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
      ),
    ),
  ]);

  const floorIds = new Set(scope.floorIds);
  for (const row of [...deviceRefs, ...wallRefs, ...linkRefs]) {
    if (row) floorIds.add(row.floorId);
  }

  const floorIdList = [...floorIds];
  const [
    floors,
    buildings,
    sites,
    devicesByFloor,
    wallsByFloor,
    linksByFloor,
    bindingsByDevice,
    bindingsByExternal,
    expiredDeviceIdsByFloor,
  ] = await Promise.all([
    ctx.db.query("floors").collect(),
    ctx.db.query("buildings").collect(),
    ctx.db.query("sites").collect(),
    Promise.all(
      floorIdList.map((floorId) =>
        ctx.db
          .query("devices")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
      ),
    ),
    Promise.all(
      floorIdList.map((floorId) =>
        ctx.db
          .query("walls")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
      ),
    ),
    Promise.all(
      floorIdList.map((floorId) =>
        ctx.db
          .query("links")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
      ),
    ),
    Promise.all(
      [...scope.deviceIds].map((deviceId) =>
        ctx.db
          .query("externalObjectBindings")
          .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
          .unique(),
      ),
    ),
    Promise.all(
      [...scope.externalIdentities.values()].map((identity) =>
        ctx.db
          .query("externalObjectBindings")
          .withIndex("by_external", (q) =>
            q
              .eq("siteId", identity.siteId)
              .eq("provider", "netbox")
              .eq("instanceKey", identity.instanceKey)
              .eq("externalId", identity.externalId),
          )
          .unique(),
      ),
    ),
    Promise.all(
      floorIdList.map((floorId) => getExpiredDeviceIdsForFloor(ctx, floorId)),
    ),
  ]);

  const devices = devicesByFloor.flat();
  const walls = wallsByFloor.flat();
  const links = linksByFloor.flat();
  const buildingSiteById = new Map(
    buildings.map((building) => [building.objectId, building.siteId]),
  );
  const siteById = new Map(sites.map((site) => [site.objectId, site]));
  const activeExternalRows = await Promise.all(
    [...scope.externalIdentities.values()].map(async (identity) => {
      const site = siteById.get(identity.siteId);
      if (!site || site.netboxInstanceKey !== identity.instanceKey) return null;
      const workflowState = await ctx.db
        .query("integrationWorkflowStates")
        .withIndex("by_site_workflow", (q) =>
          q.eq("siteId", identity.siteId).eq("workflow", "netbox"),
        )
        .unique();
      if (!workflowState?.lastPublishedId) return null;
      return await ctx.db
        .query("netboxInventory")
        .withIndex("by_generation_external", (q) =>
          q
            .eq("siteId", identity.siteId)
            .eq("generationId", workflowState.lastPublishedId as string)
            .eq("externalId", identity.externalId),
        )
        .unique();
    }),
  );
  const bindingRows = new Map<Id<"externalObjectBindings">, PlannedBinding>();
  for (const binding of [...bindingsByDevice, ...bindingsByExternal].flatMap(
    (item) => (item ? [item] : []),
  )) {
    bindingRows.set(binding._id, {
      rowId: binding._id,
      siteId: binding.siteId,
      provider: binding.provider,
      instanceKey: binding.instanceKey,
      externalId: binding.externalId,
      deviceId: binding.deviceId,
      floorId: binding.floorId,
      createdAt: binding.createdAt,
      updatedAt: binding.updatedAt,
    });
  }

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
    siteIdByFloor: new Map(
      floors.flatMap((floor) => {
        const siteId = buildingSiteById.get(floor.buildingId);
        return siteId ? [[floor.objectId, siteId] as const] : [];
      }),
    ),
    netboxInstanceKeyBySite: new Map(
      sites.map((site) => [site.objectId, site.netboxInstanceKey]),
    ),
    validExternalKeys: new Set(
      activeExternalRows.flatMap((row) =>
        row
          ? [
              externalBindingKey({
                siteId: row.siteId,
                instanceKey: row.instanceKey,
                externalId: row.externalId,
              }),
            ]
          : [],
      ),
    ),
    bindingsByKey: new Map(
      [...bindingRows.values()].map((binding) => [
        externalBindingKey(binding),
        binding,
      ]),
    ),
    bindingKeyByDevice: new Map(
      [...bindingRows.values()].map((binding) => [
        binding.deviceId,
        externalBindingKey(binding),
      ]),
    ),
    wallGeometry: new Map(
      walls.map((wall) => [
        wallGeometryKey(wall.floorId, wall.geometryKey),
        wall.objectId,
      ]),
    ),
    collisionExcludedDeviceIds: new Set(
      expiredDeviceIdsByFloor.flatMap((deviceIds) => [...deviceIds]),
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

const removePlannedBindingInsert = (state: PlanningState, key: string) => {
  state.plan = state.plan.filter(
    (write) =>
      write.kind !== "insertBinding" || externalBindingKey(write.value) !== key,
  );
};

const reserveExternalBinding = (
  state: PlanningState,
  device: PlannedDevice,
): string | null => {
  const source = device.metadata.source;
  if (!source) return null;
  const siteId = state.siteIdByFloor.get(device.floorId);
  if (!siteId || siteId !== source.siteId) {
    return "External object site does not match destination floor";
  }
  if (state.netboxInstanceKeyBySite.get(siteId) !== source.instanceKey) {
    return "External object instance does not match site configuration";
  }
  const key = externalBindingKey(source);
  if (!state.validExternalKeys.has(key)) {
    return "External object is absent from the active NetBox generation";
  }
  const existing = state.bindingsByKey.get(key);
  if (existing && existing.deviceId !== device.objectId) {
    return "External object is already placed";
  }
  const deviceKey = state.bindingKeyByDevice.get(device.objectId);
  if (deviceKey && deviceKey !== key) {
    return "Device already owns another external binding";
  }
  if (existing) return null;
  const now = device.updatedAt;
  const binding: PlannedBinding = {
    siteId,
    provider: "netbox",
    instanceKey: source.instanceKey,
    externalId: source.externalId,
    deviceId: device.objectId,
    floorId: device.floorId,
    createdAt: now,
    updatedAt: now,
  };
  state.bindingsByKey.set(key, binding);
  state.bindingKeyByDevice.set(device.objectId, key);
  state.plan.push({ kind: "insertBinding", value: binding });
  return null;
};

const releaseExternalBinding = (state: PlanningState, deviceId: string) => {
  const key = state.bindingKeyByDevice.get(deviceId);
  if (!key) return;
  const binding = state.bindingsByKey.get(key);
  state.bindingKeyByDevice.delete(deviceId);
  state.bindingsByKey.delete(key);
  if (!binding) return;
  if (binding.rowId) {
    state.plan.push({ kind: "deleteBinding", rowId: binding.rowId });
  } else {
    removePlannedBindingInsert(state, key);
  }
};

const replaceExternalBinding = (
  state: PlanningState,
  existing: PlannedDevice,
  patched: PlannedDevice,
): string | null => {
  const oldSource = existing.metadata.source;
  const newSource = patched.metadata.source;
  const oldKey = oldSource ? externalBindingKey(oldSource) : undefined;
  const newKey = newSource ? externalBindingKey(newSource) : undefined;
  if (oldKey === newKey) return null;
  if (newSource) {
    const conflict = state.bindingsByKey.get(newKey as string);
    if (conflict && conflict.deviceId !== patched.objectId) {
      return "External object is already placed";
    }
  }
  releaseExternalBinding(state, existing.objectId);
  return reserveExternalBinding(state, patched);
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
    if (state.collisionExcludedDeviceIds.has(other.objectId)) continue;
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
    if (state.collisionExcludedDeviceIds.has(device.objectId)) continue;
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
    const duplicateError = sameJson(
      plannedDevicePayload(existing),
      devicePayload(operation.device),
    )
      ? null
      : "Device object id already exists with different payload";
    return duplicateError ?? reserveExternalBinding(state, existing);
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
  const bindingError = reserveExternalBinding(state, value);
  if (bindingError) return bindingError;
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

  const bindingError = replaceExternalBinding(state, existing, patched);
  if (bindingError) return bindingError;

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
  if (!existing) return "Device not found";

  for (const link of [...state.links.values()]) {
    if (
      link.fromDeviceId === operation.deviceId ||
      link.toDeviceId === operation.deviceId
    ) {
      planLinkDeleteById(state, link.objectId);
    }
  }

  state.devices.delete(operation.deviceId);
  releaseExternalBinding(state, operation.deviceId);
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
  if (!state.links.has(operation.linkId)) return "Link not found";
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
  if (operation.wallIds.length > MAX_WALL_DELETES_PER_OPERATION) {
    return "Too many walls in one delete operation";
  }
  for (const wallId of operation.wallIds) {
    if (!state.walls.has(wallId)) return "Wall not found";
  }
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
        });
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
      case "insertBinding":
        await ctx.db.insert("externalObjectBindings", write.value);
        break;
      case "deleteBinding":
        await ctx.db.delete(write.rowId);
        break;
    }
  }
};

export interface IntegrationDeviceRelocationOperation {
  kind: "system.device.relocate";
  origin: "integration";
  operationId: string;
  expectedCycleId: string;
  expectedFence: number;
  siteId: string;
  computerExternalId: string;
  device: {
    id: string;
    name: string;
    hostname?: string;
    size: { width: number; height: number };
    metadata: Doc<"devices">["metadata"];
  };
  source: {
    floorId: string;
    position: { x: number; y: number };
  } | null;
  target: {
    floorId: string;
    position: { x: number; y: number };
  };
  occurredAt: number;
}

export type IntegrationDeviceRelocationReason =
  | "already-applied"
  | "stale-cycle"
  | "source-mismatch"
  | "missing-source-floor"
  | "missing-target-floor"
  | "blocked-by-links"
  | "device-id-conflict"
  | "duplicate-external-binding"
  | "device-collision"
  | "wall-collision"
  | "invalid-device";

export interface IntegrationDeviceRelocationFloorResult {
  floorId: string;
  effect: "device-created" | "device-moved" | "device-removed" | "device-added";
  revision: number;
}

export interface IntegrationDeviceRelocationResult {
  status: "applied" | "already_applied" | "rejected";
  deviceId: string;
  floors: Array<IntegrationDeviceRelocationFloorResult>;
  reason?: IntegrationDeviceRelocationReason;
}

const integrationSnapshot = (
  floorId: string,
  devices: Array<Doc<"devices">>,
  walls: Array<Doc<"walls">>,
  links: Array<Doc<"links">>,
): MapDocumentSnapshot => ({
  floorId: floorId as FloorId,
  revision: 0,
  devices: devices.map((device) => ({
    id: device.objectId as DeviceId,
    floorId: device.floorId as FloorId,
    type: device.type,
    name: device.name,
    hostname: device.hostname,
    position: device.position,
    size: device.size,
    metadata: device.metadata as Device["metadata"],
  })),
  walls: walls.map((wall) => ({
    id: wall.objectId as WallId,
    floorId: wall.floorId as FloorId,
    start: wall.start,
    end: wall.end,
    color: wall.color,
    geometryKey: wall.geometryKey,
  })),
  links: links.map((link) => ({
    id: link.objectId as LinkId,
    floorId: link.floorId as FloorId,
    fromDeviceId: link.fromDeviceId as DeviceId,
    fromPort: link.fromPort,
    toDeviceId: link.toDeviceId as DeviceId,
    toPort: link.toPort,
    label: link.label,
  })),
});

const integrationHistoryResult = (
  row: Doc<"integrationMapOperations">,
): IntegrationDeviceRelocationResult => ({
  status: row.status,
  deviceId: row.deviceId,
  floors: row.floors,
  reason: row.reason as IntegrationDeviceRelocationReason | undefined,
});

const recordIntegrationRelocation = async (
  ctx: MutationCtx,
  operation: IntegrationDeviceRelocationOperation,
  result: IntegrationDeviceRelocationResult,
) => {
  await ctx.db.insert("integrationMapOperations", {
    opId: operation.operationId,
    idempotencyKey: `${operation.siteId}\0${operation.computerExternalId}\0${operation.expectedCycleId}\0${operation.device.id}`,
    origin: operation.origin,
    expectedCycleId: operation.expectedCycleId,
    deviceId: operation.device.id,
    status: result.status,
    reason: result.reason,
    floors: result.floors,
    createdAt: operation.occurredAt,
    appliedAt: Date.now(),
  });
  return result;
};

const rejectedRelocation = async (
  ctx: MutationCtx,
  operation: IntegrationDeviceRelocationOperation,
  reason: Exclude<IntegrationDeviceRelocationReason, "already-applied">,
) =>
  await recordIntegrationRelocation(ctx, operation, {
    status: "rejected",
    deviceId: operation.device.id,
    floors: [],
    reason,
  });

/**
 * Internal map-domain operation used by integration workers. It is deliberately
 * a typed helper rather than a registered Convex function, so browsers cannot
 * invoke it and browser undo/history never treats it as a user operation.
 */
export const applyIntegrationDeviceRelocation = async (
  ctx: MutationCtx,
  operation: IntegrationDeviceRelocationOperation,
): Promise<IntegrationDeviceRelocationResult> => {
  const priorAttempt = await ctx.db
    .query("integrationMapOperations")
    .withIndex("by_op_id", (q) => q.eq("opId", operation.operationId))
    .unique();
  if (priorAttempt) return integrationHistoryResult(priorAttempt);

  const idempotencyKey = `${operation.siteId}\0${operation.computerExternalId}\0${operation.expectedCycleId}\0${operation.device.id}`;
  const priorApplied = await ctx.db
    .query("integrationMapOperations")
    .withIndex("by_idempotency_status", (q) =>
      q.eq("idempotencyKey", idempotencyKey).eq("status", "applied"),
    )
    .first();
  if (priorApplied) {
    return await recordIntegrationRelocation(ctx, operation, {
      status: "already_applied",
      deviceId: operation.device.id,
      floors: priorApplied.floors,
      reason: "already-applied",
    });
  }

  const [projection, location] = await Promise.all([
    ctx.db
      .query("computerProjections")
      .withIndex("by_site_computer", (q) =>
        q
          .eq("siteId", operation.siteId)
          .eq("computerExternalId", operation.computerExternalId),
      )
      .unique(),
    ctx.db
      .query("computerLocations")
      .withIndex("by_site_computer", (q) =>
        q
          .eq("siteId", operation.siteId)
          .eq("computerExternalId", operation.computerExternalId),
      )
      .unique(),
  ]);
  if (
    projection?.cycleId !== operation.expectedCycleId ||
    projection.fence !== operation.expectedFence ||
    projection.state !== "running" ||
    location?.projectionCycleId !== operation.expectedCycleId ||
    location.state !== "online"
  ) {
    return await rejectedRelocation(ctx, operation, "stale-cycle");
  }
  if (
    validatePosition(operation.target.position) ||
    validateSize(operation.device.size)
  ) {
    return await rejectedRelocation(ctx, operation, "invalid-device");
  }

  const [targetFloor, sourceFloor, bindings] = await Promise.all([
    ctx.db
      .query("floors")
      .withIndex("by_object_id", (q) =>
        q.eq("objectId", operation.target.floorId),
      )
      .unique(),
    operation.source
      ? ctx.db
          .query("floors")
          .withIndex("by_object_id", (q) =>
            q.eq("objectId", operation.source?.floorId as string),
          )
          .unique()
      : null,
    ctx.db
      .query("externalObjectBindings")
      .withIndex("by_external", (q) =>
        q
          .eq("siteId", operation.siteId)
          .eq("provider", "netbox")
          .eq("instanceKey", projection.computer.instanceKey)
          .eq("externalId", operation.computerExternalId),
      )
      .collect(),
  ]);
  if (!targetFloor) {
    return await rejectedRelocation(ctx, operation, "missing-target-floor");
  }
  if (operation.source && !sourceFloor) {
    return await rejectedRelocation(ctx, operation, "missing-source-floor");
  }
  if (bindings.length > 1) {
    return await rejectedRelocation(
      ctx,
      operation,
      "duplicate-external-binding",
    );
  }

  const binding = bindings.at(0);
  const existing = binding
    ? await ctx.db
        .query("devices")
        .withIndex("by_object_id", (q) => q.eq("objectId", binding.deviceId))
        .unique()
    : null;
  if (
    (operation.source === null && binding !== undefined) ||
    (operation.source !== null &&
      (!binding ||
        !existing ||
        existing.type !== "pc" ||
        existing.objectId !== operation.device.id ||
        existing.floorId !== operation.source.floorId ||
        !arePositionsEqual(existing.position, operation.source.position)))
  ) {
    return await rejectedRelocation(ctx, operation, "source-mismatch");
  }
  if (!binding) {
    const conflictingId = await ctx.db
      .query("devices")
      .withIndex("by_object_id", (q) => q.eq("objectId", operation.device.id))
      .unique();
    if (conflictingId) {
      return await rejectedRelocation(ctx, operation, "device-id-conflict");
    }
  }

  const expiredDeviceIds = await getExpiredDeviceIdsForFloor(
    ctx,
    operation.target.floorId,
  );
  const floorIds = [
    ...(operation.source ? [operation.source.floorId] : []),
    operation.target.floorId,
  ].filter((floorId, index, values) => values.indexOf(floorId) === index);
  const snapshots = await Promise.all(
    floorIds.map(async (floorId) => {
      const [devices, walls, links] = await Promise.all([
        ctx.db
          .query("devices")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
        ctx.db
          .query("walls")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
        ctx.db
          .query("links")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
      ]);
      return integrationSnapshot(
        floorId,
        floorId === operation.target.floorId
          ? devices.filter(
              (device) =>
                device.objectId === existing?.objectId ||
                !expiredDeviceIds.has(device.objectId),
            )
          : devices,
        walls,
        links,
      );
    }),
  );
  const planned = applySystemDeviceRelocation(snapshots, {
    kind: operation.kind,
    origin: operation.origin,
    expectedCycleId: operation.expectedCycleId,
    device: {
      id: operation.device.id as DeviceId,
      floorId: operation.target.floorId as FloorId,
      type: "pc",
      name: operation.device.name,
      hostname: operation.device.hostname,
      position: operation.target.position,
      size: operation.device.size,
      metadata: operation.device.metadata as Device["metadata"],
    },
    source: operation.source
      ? {
          floorId: operation.source.floorId as FloorId,
          position: operation.source.position,
        }
      : null,
    target: {
      floorId: operation.target.floorId as FloorId,
      position: operation.target.position,
    },
  });
  if (!planned.applied) {
    if (planned.reason === "already-applied") {
      return await recordIntegrationRelocation(ctx, operation, {
        status: "already_applied",
        deviceId: operation.device.id,
        floors: [],
        reason: planned.reason,
      });
    }
    return await rejectedRelocation(
      ctx,
      operation,
      planned.reason ?? "source-mismatch",
    );
  }

  const plannedDevice = planned.snapshots
    .flatMap((snapshot) => snapshot.devices)
    .find((device) => device.id === operation.device.id);
  if (!plannedDevice) {
    throw new Error("Applied relocation did not produce the target device");
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      floorId: plannedDevice.floorId,
      position: plannedDevice.position,
      updatedAt: operation.occurredAt,
      updatedBy: "system:computer-projection",
    });
    await ctx.db.patch((binding as Doc<"externalObjectBindings">)._id, {
      floorId: plannedDevice.floorId,
      updatedAt: operation.occurredAt,
    });
  } else {
    await ctx.db.insert("devices", {
      objectId: plannedDevice.id,
      floorId: plannedDevice.floorId,
      type: plannedDevice.type,
      name: plannedDevice.name,
      hostname: plannedDevice.hostname,
      position: plannedDevice.position,
      size: plannedDevice.size,
      metadata: plannedDevice.metadata,
      updatedAt: operation.occurredAt,
      updatedBy: "system:computer-projection",
    });
    await ctx.db.insert("externalObjectBindings", {
      siteId: operation.siteId,
      provider: "netbox",
      instanceKey: projection.computer.instanceKey,
      externalId: operation.computerExternalId,
      deviceId: operation.device.id,
      floorId: plannedDevice.floorId,
      createdAt: operation.occurredAt,
      updatedAt: operation.occurredAt,
    });
  }

  const revisions = await bumpDocumentRevisions(
    ctx,
    new Set(planned.affectedFloors.map(({ floorId }) => floorId)),
    operation.occurredAt,
  );
  const floors = planned.affectedFloors.map(({ floorId, effect }) => ({
    floorId,
    effect,
    revision: revisions.get(floorId) as number,
  }));
  return await recordIntegrationRelocation(ctx, operation, {
    status: "applied",
    deviceId: operation.device.id,
    floors,
  });
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
          })
        : undefined;
    case "device.patch":
    case "device.delete":
    case "link.delete":
    case "walls.delete":
      return undefined;
  }
};

const singleAffectedFloorId = (state: PlanningState): string | undefined =>
  state.affectedFloorIds.size === 1
    ? state.affectedFloorIds.values().next().value
    : undefined;

const validateSingleAffectedFloor = (state: PlanningState): string | null =>
  state.affectedFloorIds.size === 1
    ? null
    : "Operation must affect exactly one floor";

const clientOperationResult = (operation: Doc<"clientOperations">) => ({
  status: operation.status,
  opId: operation.opId,
  appliedRevision: operation.appliedRevision,
  floorId: operation.floorId,
  error: operation.error,
});

export const observePending = query({
  args: { opIds: v.array(v.string()) },
  returns: v.array(mapOperationResult),
  handler: async (ctx, { opIds }) => {
    if (opIds.length > MAX_OBSERVED_PENDING_OP_IDS) {
      throw new Error("Too many pending operation ids");
    }

    const uniqueOpIds = [...new Set(opIds)];
    const rows = await Promise.all(
      uniqueOpIds.map((opId) =>
        ctx.db
          .query("clientOperations")
          .withIndex("by_op_id", (q) => q.eq("opId", opId))
          .unique(),
      ),
    );

    return rows.flatMap((row) => (row ? [clientOperationResult(row)] : []));
  },
});

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
    };
    const state = await buildPlanningState(ctx, planningOperation);
    const planningError = planOperation(state, planningOperation);
    const error = planningError ?? validateSingleAffectedFloor(state);
    const status: "applied" | "rejected" = error ? "rejected" : "applied";
    let appliedRevision: number | undefined;
    let floorId = singleAffectedFloorId(state) ?? operationFloorId(operation);
    if (!error) {
      await executePlan(ctx, state.plan);
      const revisions = await bumpDocumentRevisions(
        ctx,
        state.affectedFloorIds,
        now,
      );
      floorId = singleAffectedFloorId(state);
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
