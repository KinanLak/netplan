import type { Infer } from "convex/values";
import { v } from "convex/values";
import { readerQuery, editorMutation } from "./lib/functions";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mapOperation, mapOperationResult } from "./mapValidators";
import {
  applyOverlayPatch,
  isPatchBlockedByLock,
  overlayError,
  sameOverlay,
} from "../src/map-engine/overlay";
import { isAsExpected } from "../src/map-engine/devicePatch";
import {
  applyLabelPatch,
  labelError,
  labelIsAsExpected,
} from "../src/map-engine/labels";
import { deleteDeviceMacs } from "./lib/deviceMacs";
import { observedMetadata, observedPort } from "./lib/statuses";
import { recordArrival } from "./history";
import { syncOverlayFileReleases } from "./lib/overlayFiles";
import {
  identityEditError,
  macListProblem,
  MAX_MACS_PER_DEVICE,
} from "../src/devices/identity";
import {
  MAX_PORTS_PER_DEVICE,
  cablesToLay,
  portListError,
} from "../src/devices/ports";
import {
  cableRow,
  cableRowAt,
  cableRowsOf,
  portRow,
  portRowsOf,
  portsForNewDevice,
} from "./lib/ports";
import type { NewCable, NewPort } from "./lib/ports";

export type OperationInput = Infer<typeof mapOperation>;
type DeviceCreateOperation = Extract<OperationInput, { kind: "device.create" }>;
type DevicePatchOperation = Extract<OperationInput, { kind: "device.patch" }>;
type DeviceDeleteOperation = Extract<OperationInput, { kind: "device.delete" }>;
type DevicePlaceOperation = Extract<OperationInput, { kind: "device.place" }>;
type DeviceUnplaceOperation = Extract<
  OperationInput,
  { kind: "device.unplace" }
>;
type WallAddOperation = Extract<OperationInput, { kind: "walls.add" }>;
type WallDeleteOperation = Extract<OperationInput, { kind: "walls.delete" }>;
type OverlaySetOperation = Extract<OperationInput, { kind: "overlay.set" }>;
type OverlayPatchOperation = Extract<OperationInput, { kind: "overlay.patch" }>;
type LabelCreateOperation = Extract<OperationInput, { kind: "label.create" }>;
type LabelPatchOperation = Extract<OperationInput, { kind: "label.patch" }>;
type LabelDeleteOperation = Extract<OperationInput, { kind: "label.delete" }>;

type DeviceInput = DeviceCreateOperation["device"];
type WallInput = WallAddOperation["walls"][number];

type DeviceRow = Omit<Doc<"devices">, "_id" | "_creationTime">;
type DevicePlacement = NonNullable<DeviceRow["placement"]>;
/** A placed device, flattened as the map sees it. */
type DeviceInsert = Omit<DeviceRow, "placement"> & DevicePlacement;
type WallInsert = Omit<Doc<"walls">, "_id" | "_creationTime">;
type PortInsert = Omit<Doc<"ports">, "_id" | "_creationTime">;
type CableInsert = Omit<Doc<"cables">, "_id" | "_creationTime">;
type OverlayValue = Omit<Doc<"floorOverlays">, "_id" | "_creationTime">;
type LabelInsert = Omit<Doc<"mapLabels">, "_id" | "_creationTime">;

type DevicePatch = Pick<DeviceRow, "placement" | "updatedAt" | "updatedBy">;
type PlannedDevice = DeviceInsert & { rowId?: Id<"devices"> };
type UnplacedDevice = Omit<DeviceRow, "placement"> & { rowId: Id<"devices"> };
type PlannedWall = WallInsert & { rowId?: Id<"walls"> };
type PlannedPort = PortInsert & { rowId?: Id<"ports"> };
type PlannedCable = CableInsert & { rowId?: Id<"cables"> };
type PlannedLabel = LabelInsert & { rowId?: Id<"mapLabels"> };

type WritePlan = Array<
  | { kind: "insertDevice"; value: DeviceInsert }
  | { kind: "patchDevice"; rowId: Id<"devices">; value: DevicePatch }
  | { kind: "deleteDevice"; rowId: Id<"devices">; objectId: string }
  | { kind: "insertWall"; value: WallInsert }
  | { kind: "deleteWall"; rowId: Id<"walls"> }
  | { kind: "insertPort"; value: PortInsert }
  | { kind: "deletePort"; rowId: Id<"ports"> }
  | { kind: "insertCable"; value: CableInsert }
  | { kind: "deleteCable"; rowId: Id<"cables"> }
  | {
      kind: "putOverlay";
      rowId?: Id<"floorOverlays">;
      value: OverlayValue | null;
      floorId: string;
    }
  | { kind: "insertLabel"; value: LabelInsert }
  | { kind: "replaceLabel"; rowId: Id<"mapLabels">; value: LabelInsert }
  | { kind: "deleteLabel"; rowId: Id<"mapLabels"> }
>;

interface PlanningState {
  /** The site of each loaded floor. */
  floorSites: Map<string, string>;
  devices: Map<string, PlannedDevice>;
  /** Referenced devices that exist in the inventory but on no floor. */
  unplacedDevices: Map<string, UnplacedDevice>;
  /** The device owning each loaded MAC address, keyed by `macKey`. */
  macOwners: Map<string, string>;
  walls: Map<string, PlannedWall>;
  /**
   * The loaded ports and cables: those of created and deleted devices, and
   * the far ends of created cables.
   */
  ports: Map<string, PlannedPort>;
  cables: Map<string, PlannedCable>;
  /** The cable in each loaded port that holds one. */
  cabledPorts: Map<string, string>;
  wallGeometry: Map<string, string>;
  /** The calque each loaded floor will have, `null` for none. */
  overlays: Map<string, OverlayValue | null>;
  overlayRowIds: Map<string, Id<"floorOverlays">>;
  overlayFiles: Map<string, { width: number; height: number }>;
  touchedOverlayFileIds: Set<string>;
  /** The free text labels of the loaded floors, and those the scope names. */
  labels: Map<string, PlannedLabel>;
  affectedFloorIds: Set<string>;
  plan: WritePlan;
}

const GRID_SIZE = 20;
const WALL_THICKNESS = GRID_SIZE;
const MAX_BATCH_OPERATIONS = 100;
const MAX_WALLS_PER_OPERATION = 500;
const MAX_WALL_DELETES_PER_OPERATION = 500;
const MAX_OBSERVED_PENDING_OP_IDS = 100;

const macKey = (siteId: string, mac: string): string => `${siteId}:${mac}`;

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
    return "La position est invalide.";
  }
  return null;
};

const validateSize = (size: {
  width: number;
  height: number;
}): string | null => {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height)) {
    return "La taille est invalide.";
  }
  if (size.width <= 0 || size.height <= 0) {
    return "La taille doit être positive.";
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

export const getWallCollisionRect = (
  wall: Pick<WallInput, "start" | "end">,
) => {
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

const deviceFields = (id: string, device: Omit<DeviceInput, "id">) => ({
  id,
  floorId: device.floorId,
  type: device.type,
  name: device.name,
  hostname: device.hostname,
  serial: device.serial,
  macs: device.macs,
  model: device.model,
  ip: device.ip,
  notes: device.notes,
  position: device.position,
  size: device.size,
  metadata: device.metadata,
});

const devicePayload = (device: DeviceInput) => deviceFields(device.id, device);

const plannedDevicePayload = (device: PlannedDevice) =>
  deviceFields(device.objectId, device);

const plannedDeviceFromRow = (
  { _id, _creationTime, placement: _placement, ...row }: Doc<"devices">,
  placement: DevicePlacement,
): PlannedDevice => ({ ...row, ...placement, rowId: _id });

const deviceRowFromPlanned = ({
  floorId,
  position,
  size,
  ...device
}: DeviceInsert): DeviceRow => ({
  ...device,
  placement: { floorId, position, size },
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

const plannedPortPayload = (value: PlannedPort): NewPort => ({
  id: value.objectId,
  deviceId: value.deviceId,
  name: value.name,
  kind: value.kind,
  order: value.order,
  rearPortId: value.rearPortId,
  status: value.status,
  seen: value.seen,
});

const portPayload = (value: NewPort): NewPort => ({
  id: value.id,
  deviceId: value.deviceId,
  name: value.name,
  kind: value.kind,
  order: value.order,
  rearPortId: value.rearPortId,
  status: value.status,
  seen: value.seen,
});

const byId = (left: { id: string }, right: { id: string }) =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

const cableTouchesDevice = (value: CableInsert, deviceId: string) =>
  value.aDeviceId === deviceId || value.bDeviceId === deviceId;

const wallGeometryKey = (floorId: string, geometryKey: string): string =>
  `${floorId}:${geometryKey}`;

interface OperationScope {
  floorIds: Set<string>;
  deviceIds: Set<string>;
  /** MAC addresses of created devices, whose owners planning must know. */
  createdMacs: Array<{ floorId: string; mac: string }>;
  wallIds: Set<string>;
  /** Devices whose ports and cables planning must know. */
  cablingDeviceIds: Set<string>;
  /** Ports created cables plug into, and created cable ids. */
  cablePortIds: Set<string>;
  /** Ports created devices would have, which must not exist yet. */
  newPortIds: Set<string>;
  cableIds: Set<string>;
  overlayFileIds: Set<string>;
  labelIds: Set<string>;
}

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
    createdMacs: [],
    wallIds: new Set(),
    cablingDeviceIds: new Set(),
    cablePortIds: new Set(),
    newPortIds: new Set(),
    cableIds: new Set(),
    overlayFileIds: new Set(),
    labelIds: new Set(),
  },
): OperationScope => {
  switch (operation.kind) {
    case "device.create":
      scope.floorIds.add(operation.device.floorId);
      scope.deviceIds.add(operation.device.id);
      scope.cablingDeviceIds.add(operation.device.id);
      // Planning rejects longer lists before it would need these rows.
      if ((operation.ports?.length ?? 0) <= MAX_PORTS_PER_DEVICE) {
        for (const port of portsForNewDevice(
          operation.device.id,
          operation.device.type,
          operation.ports,
        )) {
          scope.newPortIds.add(port.id);
        }
      }
      if ((operation.cables?.length ?? 0) <= MAX_PORTS_PER_DEVICE) {
        for (const value of operation.cables ?? []) {
          scope.cableIds.add(value.id);
          scope.cablePortIds.add(value.a.portId);
          scope.cablePortIds.add(value.b.portId);
        }
      }
      if (operation.device.macs.length <= MAX_MACS_PER_DEVICE) {
        for (const mac of operation.device.macs) {
          scope.createdMacs.push({ floorId: operation.device.floorId, mac });
        }
      }
      break;
    case "device.patch":
      scope.deviceIds.add(operation.deviceId);
      break;
    case "device.delete":
      scope.deviceIds.add(operation.deviceId);
      scope.cablingDeviceIds.add(operation.deviceId);
      break;
    case "device.unplace":
      scope.deviceIds.add(operation.deviceId);
      break;
    case "device.place":
      scope.floorIds.add(operation.device.floorId);
      scope.deviceIds.add(operation.device.id);
      break;
    case "walls.add":
      // Created wall ids are covered by loading their declared floor;
      // replayed operations are already deduplicated by opId upstream.
      for (const wall of operation.walls) scope.floorIds.add(wall.floorId);
      break;
    case "walls.delete":
      for (const wallId of operation.wallIds) scope.wallIds.add(wallId);
      break;
    case "overlay.set":
      scope.floorIds.add(operation.floorId);
      if (operation.overlay) scope.overlayFileIds.add(operation.overlay.fileId);
      break;
    case "overlay.patch":
      scope.floorIds.add(operation.floorId);
      break;
    case "label.create":
      scope.floorIds.add(operation.label.floorId);
      scope.labelIds.add(operation.label.id);
      break;
    case "label.patch":
    case "label.delete":
      scope.labelIds.add(operation.labelId);
      break;
    case "batch":
      for (const subOperation of operation.operations) {
        collectOperationScope({ ...subOperation, meta: operation.meta }, scope);
      }
      break;
  }
  return scope;
};

/** The site of each existing floor, through its building. */
const loadFloorSites = async (
  ctx: MutationCtx,
  floorIds: Array<string>,
): Promise<Map<string, string>> => {
  const floors = await Promise.all(
    floorIds.map((objectId) =>
      ctx.db
        .query("floors")
        .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
        .unique(),
    ),
  );
  const buildingIds = [
    ...new Set(floors.flatMap((floor) => (floor ? [floor.buildingId] : []))),
  ];
  const buildings = await Promise.all(
    buildingIds.map((objectId) =>
      ctx.db
        .query("buildings")
        .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
        .unique(),
    ),
  );
  const buildingSites = new Map(
    buildings.flatMap((building) =>
      building ? [[building.objectId, building.siteId] as const] : [],
    ),
  );
  const floorSites = new Map<string, string>();
  for (const floor of floors) {
    const siteId = floor && buildingSites.get(floor.buildingId);
    if (floor && siteId) floorSites.set(floor.objectId, siteId);
  }
  return floorSites;
};

/** The ports and cables the scope names, with the cable in each port. */
const loadCabling = async (ctx: MutationCtx, scope: OperationScope) => {
  const [
    devicePorts,
    deviceCables,
    portRefs,
    newPortRefs,
    portCables,
    cableRefs,
  ] = await Promise.all([
    Promise.all(
      [...scope.cablingDeviceIds].map((deviceId) => portRowsOf(ctx, deviceId)),
    ),
    Promise.all(
      [...scope.cablingDeviceIds].map((deviceId) => cableRowsOf(ctx, deviceId)),
    ),
    Promise.all(
      [...scope.cablePortIds].map((objectId) =>
        ctx.db
          .query("ports")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
      ),
    ),
    Promise.all(
      [...scope.newPortIds].map((objectId) =>
        ctx.db
          .query("ports")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .first(),
      ),
    ),
    Promise.all(
      [...scope.cablePortIds].map((portId) => cableRowAt(ctx, portId)),
    ),
    Promise.all(
      [...scope.cableIds].map((objectId) =>
        ctx.db
          .query("cables")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
      ),
    ),
  ]);
  const ports = new Map<string, PlannedPort>();
  for (const row of [...devicePorts.flat(), ...portRefs, ...newPortRefs]) {
    if (!row) continue;
    const { _id, _creationTime, ...value } = row;
    ports.set(row.objectId, { ...value, rowId: _id });
  }
  const cables = new Map<string, PlannedCable>();
  for (const row of [...deviceCables.flat(), ...portCables, ...cableRefs]) {
    if (!row) continue;
    const { _id, _creationTime, ...value } = row;
    cables.set(row.objectId, { ...value, rowId: _id });
  }
  const cabledPorts = new Map<string, string>();
  for (const value of cables.values()) {
    cabledPorts.set(value.aPortId, value.objectId);
    cabledPorts.set(value.bPortId, value.objectId);
  }
  return { ports, cables, cabledPorts };
};

const buildPlanningState = async (
  ctx: MutationCtx,
  operation: OperationInput,
): Promise<PlanningState> => {
  const scope = collectOperationScope(operation);

  // Resolve the floors of referenced objects through point lookups, then
  // load only those floors' rows.
  const [deviceRefs, wallRefs, labelRefs] = await Promise.all([
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
      [...scope.labelIds].map((objectId) =>
        ctx.db
          .query("mapLabels")
          .withIndex("by_object_id", (q) => q.eq("objectId", objectId))
          .unique(),
      ),
    ),
  ]);

  const floorIds = new Set(scope.floorIds);
  const unplacedDevices = new Map<string, UnplacedDevice>();
  for (const row of deviceRefs) {
    if (!row) continue;
    const { _id, _creationTime, placement, ...device } = row;
    if (placement) floorIds.add(placement.floorId);
    else unplacedDevices.set(row.objectId, { ...device, rowId: _id });
  }
  for (const row of wallRefs) {
    if (row) floorIds.add(row.floorId);
  }
  for (const row of labelRefs) {
    if (row) floorIds.add(row.floorId);
  }

  const floorIdList = [...floorIds];
  const floorSites = await loadFloorSites(ctx, floorIdList);
  const macOwnerRows = await Promise.all(
    scope.createdMacs.map(({ floorId, mac }) => {
      const siteId = floorSites.get(floorId);
      if (!siteId) return null;
      return ctx.db
        .query("deviceMacs")
        .withIndex("by_site_mac", (q) => q.eq("siteId", siteId).eq("mac", mac))
        .unique();
    }),
  );
  const [
    devicesByFloor,
    wallsByFloor,
    overlayRows,
    overlayFileRows,
    cabling,
    labelsByFloor,
  ] = await Promise.all([
    Promise.all(
      floorIdList.map((floorId) =>
        ctx.db
          .query("devices")
          .withIndex("by_floor", (q) => q.eq("placement.floorId", floorId))
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
          .query("floorOverlays")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .unique(),
      ),
    ),
    Promise.all(
      [...scope.overlayFileIds].map((fileId) =>
        ctx.db
          .query("floorOverlayFiles")
          .withIndex("by_object_id", (q) => q.eq("objectId", fileId))
          .unique(),
      ),
    ),
    loadCabling(ctx, scope),
    Promise.all(
      floorIdList.map((floorId) =>
        ctx.db
          .query("mapLabels")
          .withIndex("by_floor", (q) => q.eq("floorId", floorId))
          .collect(),
      ),
    ),
  ]);
  const loadedOverlays = overlayRows.flatMap((row) => (row ? [row] : []));

  const devices = devicesByFloor.flat();
  const walls = wallsByFloor.flat();
  return {
    floorSites,
    devices: new Map(
      devices.flatMap((device) =>
        device.placement
          ? [
              [
                device.objectId,
                plannedDeviceFromRow(device, device.placement),
              ] as const,
            ]
          : [],
      ),
    ),
    unplacedDevices,
    macOwners: new Map(
      macOwnerRows.flatMap((row) =>
        row ? [[macKey(row.siteId, row.mac), row.deviceId] as const] : [],
      ),
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
    ...cabling,
    wallGeometry: new Map(
      walls.map((wall) => [
        wallGeometryKey(wall.floorId, wall.geometryKey),
        wall.objectId,
      ]),
    ),
    overlays: new Map([
      ...floorIdList.map((floorId) => [floorId, null] as const),
      ...loadedOverlays.map(
        ({ _id, _creationTime, ...overlay }) =>
          [overlay.floorId, overlay] as const,
      ),
    ]),
    overlayRowIds: new Map(
      loadedOverlays.map((overlay) => [overlay.floorId, overlay._id]),
    ),
    overlayFiles: new Map(
      overlayFileRows.flatMap((file) =>
        file
          ? [[file.objectId, { width: file.width, height: file.height }]]
          : [],
      ),
    ),
    touchedOverlayFileIds: new Set(),
    labels: new Map(
      labelsByFloor
        .flat()
        .map(({ _id, _creationTime, ...label }) => [
          label.objectId,
          { ...label, rowId: _id },
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
  state.floorSites.has(floorId) ? null : "Cet étage n'existe plus.";

const removePlannedInsert = (
  state: PlanningState,
  kind: "insertDevice" | "insertWall" | "insertPort" | "insertCable",
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
      const { rowId: _rowId, ...value } = device;
      write.value = value;
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
      return "L'équipement chevauche un autre équipement.";
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
      return "L'équipement chevauche un mur.";
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

const deviceMacsError = (
  state: PlanningState,
  siteId: string,
  device: DeviceInput,
): string | null => {
  const problem = macListProblem(device.macs);
  if (problem === "too-many") return "Trop d'adresses MAC.";
  if (problem === "duplicate") return "Une adresse MAC est en double.";
  if (problem === "invalid") return "Une adresse MAC est invalide.";
  for (const mac of device.macs) {
    const owner = state.macOwners.get(macKey(siteId, mac));
    if (owner && owner !== device.id) {
      return "Une adresse MAC appartient déjà à un autre équipement du site.";
    }
  }
  return null;
};

const planDeviceCreate = (
  state: PlanningState,
  created: DeviceCreateOperation,
): string | null => {
  // A device drawn with a hostname is named after it (B10), so the row
  // inserted, and the replay compared with it, carry that name.
  const hostname = created.device.hostname?.trim();
  const operation = hostname
    ? { ...created, device: { ...created.device, name: hostname } }
    : created;
  const siteId = state.floorSites.get(operation.device.floorId);
  if (!siteId) return "Cet étage n'existe plus.";
  const shapeError = validateDeviceShape(operation.device);
  if (shapeError) return shapeError;
  if (state.unplacedDevices.has(operation.device.id)) {
    return "Cet équipement existe déjà avec d'autres valeurs.";
  }

  const ports = portsForNewDevice(
    operation.device.id,
    operation.device.type,
    operation.ports,
  );
  const cables = operation.cables ?? [];
  const existing = state.devices.get(operation.device.id);
  if (existing) {
    markAffectedFloor(state, existing.floorId);
    return sameJson(
      plannedDevicePayload(existing),
      devicePayload(operation.device),
    ) && sameCabling(state, operation.device.id, ports, cables)
      ? null
      : "Cet équipement existe déjà avec d'autres valeurs.";
  }

  const macsError = deviceMacsError(state, siteId, operation.device);
  if (macsError) return macsError;
  const identityError = identityEditError(operation.device);
  if (identityError) return identityError;
  if (portListError(operation.device.id, ports)) {
    return "Les ports de cet équipement sont invalides.";
  }
  if (cables.length > MAX_PORTS_PER_DEVICE)
    return "Les câbles de cet équipement sont invalides.";
  // Another device's ids may embed this one's, so a port id can be taken.
  if (ports.some((port) => state.ports.has(port.id))) {
    return "Les ports de cet équipement sont invalides.";
  }

  const placementError = validateDevicePlacement(state, {
    objectId: operation.device.id,
    floorId: operation.device.floorId,
    position: operation.device.position,
    size: operation.device.size,
  });
  if (placementError) return placementError;

  const { id, ...device } = operation.device;
  const value: DeviceInsert = {
    ...device,
    objectId: id,
    siteId,
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  state.devices.set(id, value);
  for (const mac of value.macs) state.macOwners.set(macKey(siteId, mac), id);
  markAffectedFloor(state, operation.device.floorId);
  state.plan.push({ kind: "insertDevice", value });
  for (const port of ports) {
    const row = portRow(siteId, port);
    state.ports.set(port.id, row);
    state.plan.push({ kind: "insertPort", value: row });
  }
  return planCables(
    state,
    siteId,
    id,
    new Set(ports.map((port) => port.id)),
    cables,
    operation.meta,
  );
};

/** Whether a device's loaded ports and cables are the ones given. */
const sameCabling = (
  state: PlanningState,
  deviceId: string,
  ports: Array<NewPort>,
  cables: Array<NewCable>,
): boolean => {
  const current = [...state.ports.values()]
    .filter((port) => port.deviceId === deviceId)
    .map(plannedPortPayload)
    .sort(byId);
  if (!sameJson(current, ports.map(portPayload).sort(byId))) return false;
  return cables.every((value) => {
    const laid = state.cables.get(value.id);
    return (
      laid !== undefined &&
      laid.aPortId === value.a.portId &&
      laid.bPortId === value.b.portId
    );
  });
};

/**
 * Lays a new device's cables. Each plugs into one of its ports; the other
 * end may be any port of the site, on a floor or not, and only the device's
 * floor is affected: the far floor's cables follow from its query. A cable
 * that no longer fits is left out (`cablesToLay`).
 */
const planCables = (
  state: PlanningState,
  siteId: string,
  deviceId: string,
  ownPortIds: ReadonlySet<string>,
  cables: Array<NewCable>,
  meta: OperationInput["meta"],
): string | null => {
  const result = cablesToLay(deviceId, ownPortIds, cables, {
    farPortOf: (end) => {
      const port = state.ports.get(end.portId);
      return port?.siteId === siteId ? port : undefined;
    },
    isCabled: (portId) => state.cabledPorts.has(portId),
    cableExists: (cableId) => state.cables.has(cableId),
  });
  if ("error" in result) return "Les câbles de cet équipement sont invalides.";
  for (const value of result.cables) {
    const row = cableRow(siteId, value, meta.createdAt, meta.clientId);
    state.cables.set(value.id, row);
    state.cabledPorts.set(value.a.portId, value.id);
    state.cabledPorts.set(value.b.portId, value.id);
    state.plan.push({ kind: "insertCable", value: row });
  }
  return null;
};

/** An undo or a redo finds the device moved by someone else (ADR 0025). */
const MOVED_SINCE =
  "Cet équipement a été déplacé depuis, par une autre personne ou par la collecte.";

const planDevicePatch = (
  state: PlanningState,
  operation: DevicePatchOperation,
): string | null => {
  const existing = state.devices.get(operation.deviceId);
  if (!existing) return "Cet équipement n'existe plus.";
  if (operation.expected && !isAsExpected(existing, operation.expected)) {
    return MOVED_SINCE;
  }

  const patched: PlannedDevice = {
    ...existing,
    position: operation.patch.position ?? existing.position,
    size: operation.patch.size ?? existing.size,
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
        placement: {
          floorId: patched.floorId,
          position: patched.position,
          size: patched.size,
        },
        updatedAt: patched.updatedAt,
        updatedBy: patched.updatedBy,
      },
    });
  } else {
    updatePlannedDeviceInsert(state, patched);
  }

  return null;
};

/** Deletes a device's ports and the cables plugged into them. */
const planCablingDelete = (state: PlanningState, deviceId: string) => {
  for (const value of [...state.cables.values()]) {
    if (!cableTouchesDevice(value, deviceId)) continue;
    state.cables.delete(value.objectId);
    state.cabledPorts.delete(value.aPortId);
    state.cabledPorts.delete(value.bPortId);
    if (value.rowId) {
      state.plan.push({ kind: "deleteCable", rowId: value.rowId });
    } else {
      removePlannedInsert(state, "insertCable", value.objectId);
    }
  }
  for (const port of [...state.ports.values()]) {
    if (port.deviceId !== deviceId) continue;
    state.ports.delete(port.objectId);
    if (port.rowId) {
      state.plan.push({ kind: "deletePort", rowId: port.rowId });
    } else {
      removePlannedInsert(state, "insertPort", port.objectId);
    }
  }
};

const planDeviceDelete = (
  state: PlanningState,
  operation: DeviceDeleteOperation,
): string | null => {
  const existing = state.devices.get(operation.deviceId);
  if (!existing) return "Cet équipement n'existe plus.";
  // Its integration would bring it back at the next sync.
  if (existing.source)
    return "Cet équipement vient d'une intégration : il ne peut pas être supprimé.";

  planCablingDelete(state, operation.deviceId);
  state.devices.delete(operation.deviceId);
  for (const mac of existing.macs) {
    const key = macKey(existing.siteId, mac);
    if (state.macOwners.get(key) === operation.deviceId) {
      state.macOwners.delete(key);
    }
  }
  markAffectedFloor(state, existing.floorId);
  if (existing.rowId) {
    state.plan.push({
      kind: "deleteDevice",
      rowId: existing.rowId,
      objectId: existing.objectId,
    });
  } else {
    removePlannedInsert(state, "insertDevice", operation.deviceId);
  }
  return null;
};

const planDevicePlace = (
  state: PlanningState,
  operation: DevicePlaceOperation,
): string | null => {
  const { id, floorId, position, size } = operation.device;
  const siteId = state.floorSites.get(floorId);
  if (!siteId) return "Cet étage n'existe plus.";
  const shapeError = validateDeviceShape(operation.device);
  if (shapeError) return shapeError;

  const placed = state.devices.get(id);
  if (placed) {
    markAffectedFloor(state, placed.floorId);
    return sameJson(
      { floorId: placed.floorId, position: placed.position, size: placed.size },
      { floorId, position, size },
    )
      ? null
      : "Cet équipement est déjà sur le plan.";
  }
  const existing = state.unplacedDevices.get(id);
  if (!existing) return "Cet équipement n'existe plus.";
  if (existing.siteId !== siteId)
    return "Cet équipement appartient à un autre site.";

  const placementError = validateDevicePlacement(state, {
    objectId: id,
    floorId,
    position,
    size,
  });
  if (placementError) return placementError;

  // Only where it stands comes from the operation; the identity stays the
  // inventory's.
  const value: PlannedDevice = {
    ...existing,
    floorId,
    position,
    size,
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  state.unplacedDevices.delete(id);
  state.devices.set(id, value);
  markAffectedFloor(state, floorId);
  state.plan.push({
    kind: "patchDevice",
    rowId: existing.rowId,
    value: {
      placement: { floorId, position, size },
      updatedAt: value.updatedAt,
      updatedBy: value.updatedBy,
    },
  });
  return null;
};

const planDeviceUnplace = (
  state: PlanningState,
  operation: DeviceUnplaceOperation,
): string | null => {
  const existing = state.devices.get(operation.deviceId);
  // A device created by the same batch has no row to keep yet.
  if (!existing?.rowId) return "Cet équipement n'existe plus.";
  if (operation.expected && !isAsExpected(existing, operation.expected)) {
    return MOVED_SINCE;
  }

  // Its ports and cables stay with it in the inventory.
  const { floorId, position: _position, size: _size, ...device } = existing;
  const updatedAt = operation.meta.createdAt;
  const updatedBy = operation.meta.clientId;
  state.devices.delete(operation.deviceId);
  state.unplacedDevices.set(operation.deviceId, {
    ...device,
    rowId: existing.rowId,
    updatedAt,
    updatedBy,
  });
  markAffectedFloor(state, floorId);
  state.plan.push({
    kind: "patchDevice",
    rowId: existing.rowId,
    value: { placement: undefined, updatedAt, updatedBy },
  });
  return null;
};

const planWallsAdd = (
  state: PlanningState,
  operation: WallAddOperation,
): string | null => {
  if (operation.walls.length > MAX_WALLS_PER_OPERATION) {
    return "Trop de murs en une seule modification.";
  }
  for (const input of operation.walls) {
    const wall = canonicalWall(input);
    if (!wall) return "La forme du mur est invalide.";

    const existingFloorError = floorError(state, wall.floorId);
    if (existingFloorError) return existingFloorError;

    const existing = state.walls.get(wall.id);
    if (existing) {
      markAffectedFloor(state, existing.floorId);
      if (!sameJson(plannedWallPayload(existing), wallPayload(wall))) {
        return "Ce mur existe déjà avec d'autres valeurs.";
      }
      continue;
    }

    const geometryKey = wallGeometryKey(wall.floorId, wall.geometryKey);
    if (state.wallGeometry.has(geometryKey)) {
      markAffectedFloor(state, wall.floorId);
      continue;
    }

    if (wallCollidesWithDevice(state, wall)) {
      return "Le mur chevauche un équipement.";
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
    return "Trop de murs en une seule modification.";
  }
  for (const wallId of operation.wallIds) {
    if (!state.walls.has(wallId)) return "Ce mur n'existe plus.";
  }
  for (const wallId of operation.wallIds) planWallDeleteById(state, wallId);
  return null;
};

const overlayValueError = (
  state: PlanningState,
  overlay: OverlayValue,
): string | null => {
  const invalid = overlayError(overlay);
  if (invalid) return "Le placement du calque est invalide.";
  const file = state.overlayFiles.get(overlay.fileId);
  if (!file) return "L'image du calque n'existe plus.";
  if (
    file.width !== overlay.imageWidth ||
    file.height !== overlay.imageHeight
  ) {
    return "La taille du calque ne correspond pas à son image.";
  }
  return null;
};

/**
 * Records the floor's final calque as one write, so a batch that touches it
 * twice still inserts, replaces or deletes the row once.
 */
const putOverlay = (
  state: PlanningState,
  floorId: string,
  value: OverlayValue | null,
) => {
  const previous = state.overlays.get(floorId);
  if (previous) state.touchedOverlayFileIds.add(previous.fileId);
  if (value) state.touchedOverlayFileIds.add(value.fileId);
  state.overlays.set(floorId, value);
  state.plan = state.plan.filter(
    (write) => write.kind !== "putOverlay" || write.floorId !== floorId,
  );
  state.plan.push({
    kind: "putOverlay",
    floorId,
    rowId: state.overlayRowIds.get(floorId),
    value,
  });
  markAffectedFloor(state, floorId);
};

const planOverlaySet = (
  state: PlanningState,
  operation: OverlaySetOperation,
): string | null => {
  const existingFloorError = floorError(state, operation.floorId);
  if (existingFloorError) return existingFloorError;
  const current = state.overlays.get(operation.floorId) ?? null;
  const next = operation.overlay;
  if (!current && !next) return "Ce calque n'existe plus.";

  if (next) {
    if (next.floorId !== operation.floorId) {
      return "Ce calque appartient à un autre étage.";
    }
    if (current && sameOverlay(current, next)) {
      markAffectedFloor(state, operation.floorId);
      return null;
    }
  }
  if (current?.locked) return "Le calque est verrouillé.";
  if (!next) {
    putOverlay(state, operation.floorId, null);
    return null;
  }

  const value: OverlayValue = {
    ...next,
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  const valueError = overlayValueError(state, value);
  if (valueError) return valueError;
  putOverlay(state, operation.floorId, value);
  return null;
};

const planOverlayPatch = (
  state: PlanningState,
  operation: OverlayPatchOperation,
): string | null => {
  const existingFloorError = floorError(state, operation.floorId);
  if (existingFloorError) return existingFloorError;
  const current = state.overlays.get(operation.floorId);
  if (!current) return "Ce calque n'existe plus.";
  if (isPatchBlockedByLock(current, operation.patch)) {
    return "Le calque est verrouillé.";
  }

  const value: OverlayValue = {
    ...applyOverlayPatch(current, operation.patch),
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  const invalid = overlayError(value);
  if (invalid) return "Le placement du calque est invalide.";
  if (sameOverlay(current, value)) {
    markAffectedFloor(state, operation.floorId);
    return null;
  }
  putOverlay(state, operation.floorId, value);
  return null;
};

const LABEL_ID = /^label:[\w:.-]{1,120}$/;

/** Records a label's final value as one write, as `putOverlay` does. */
const putLabel = (
  state: PlanningState,
  value: PlannedLabel | null,
  objectId: string,
) => {
  const previous = state.labels.get(objectId);
  state.plan = state.plan.filter(
    (write) =>
      !(
        (write.kind === "insertLabel" && write.value.objectId === objectId) ||
        (write.kind === "replaceLabel" && write.rowId === previous?.rowId)
      ),
  );
  if (value) {
    const { rowId, ...row } = value;
    state.plan.push(
      rowId
        ? { kind: "replaceLabel", rowId, value: row }
        : { kind: "insertLabel", value: row },
    );
    state.labels.set(objectId, value);
  } else {
    if (previous?.rowId) {
      state.plan.push({ kind: "deleteLabel", rowId: previous.rowId });
    }
    state.labels.delete(objectId);
  }
  markAffectedFloor(state, (value ?? previous)?.floorId ?? "");
};

const planLabelCreate = (
  state: PlanningState,
  operation: LabelCreateOperation,
): string | null => {
  const { label } = operation;
  const existingFloorError = floorError(state, label.floorId);
  if (existingFloorError) return existingFloorError;
  if (!LABEL_ID.test(label.id)) return "Identifiant d'étiquette invalide.";
  if (state.labels.has(label.id)) {
    const current = state.labels.get(label.id);
    if (
      current?.floorId === label.floorId &&
      current.text === label.text &&
      arePositionsEqual(current.position, label.position)
    ) {
      markAffectedFloor(state, label.floorId);
      return null;
    }
    return "Cette étiquette existe déjà.";
  }
  const invalid = labelError(label);
  if (invalid) return invalid;
  putLabel(
    state,
    {
      objectId: label.id,
      floorId: label.floorId,
      text: label.text,
      position: label.position,
      updatedAt: operation.meta.createdAt,
      updatedBy: operation.meta.clientId,
    },
    label.id,
  );
  return null;
};

const planLabelPatch = (
  state: PlanningState,
  operation: LabelPatchOperation,
): string | null => {
  const current = state.labels.get(operation.labelId);
  if (!current) return "Cette étiquette n'existe plus.";
  if (!labelIsAsExpected(current, operation.expected)) {
    return "L'étiquette a été modifiée depuis, par une autre personne.";
  }
  const next = {
    ...applyLabelPatch(current, operation.patch),
    updatedAt: operation.meta.createdAt,
    updatedBy: operation.meta.clientId,
  };
  const invalid = labelError(next);
  if (invalid) return invalid;
  putLabel(state, next, operation.labelId);
  return null;
};

const planLabelDelete = (
  state: PlanningState,
  operation: LabelDeleteOperation,
): string | null => {
  if (!state.labels.has(operation.labelId)) {
    return "Cette étiquette n'existe plus.";
  }
  putLabel(state, null, operation.labelId);
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
    case "device.place":
      return planDevicePlace(state, operation);
    case "device.unplace":
      return planDeviceUnplace(state, operation);
    case "walls.add":
      return planWallsAdd(state, operation);
    case "walls.delete":
      return planWallsDelete(state, operation);
    case "overlay.set":
      return planOverlaySet(state, operation);
    case "overlay.patch":
      return planOverlayPatch(state, operation);
    case "label.create":
      return planLabelCreate(state, operation);
    case "label.patch":
      return planLabelPatch(state, operation);
    case "label.delete":
      return planLabelDelete(state, operation);
    case "batch": {
      if (operation.operations.length > MAX_BATCH_OPERATIONS) {
        return "Trop de modifications en une fois.";
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
      case "insertDevice": {
        const row = deviceRowFromPlanned(write.value);
        await ctx.db.insert("devices", {
          ...row,
          metadata: await observedMetadata(ctx, row, row.metadata),
        });
        for (const mac of write.value.macs) {
          await ctx.db.insert("deviceMacs", {
            siteId: write.value.siteId,
            mac,
            deviceId: write.value.objectId,
          });
        }
        await recordArrival(ctx, write.value.objectId, Date.now());
        break;
      }
      case "patchDevice":
        await ctx.db.patch(write.rowId, write.value);
        break;
      case "deleteDevice":
        await ctx.db.delete(write.rowId);
        await deleteDeviceMacs(ctx, write.objectId);
        break;
      case "insertWall":
        await ctx.db.insert("walls", write.value);
        break;
      case "deleteWall":
        await ctx.db.delete(write.rowId);
        break;
      case "insertPort":
        await ctx.db.insert("ports", await observedPort(ctx, write.value));
        break;
      case "deletePort":
        await ctx.db.delete(write.rowId);
        break;
      case "insertCable":
        await ctx.db.insert("cables", write.value);
        break;
      case "deleteCable":
        await ctx.db.delete(write.rowId);
        break;
      case "putOverlay":
        if (write.rowId && write.value) {
          await ctx.db.replace(write.rowId, write.value);
        } else if (write.rowId) {
          await ctx.db.delete(write.rowId);
        } else if (write.value) {
          await ctx.db.insert("floorOverlays", write.value);
        }
        break;
      case "insertLabel":
        await ctx.db.insert("mapLabels", write.value);
        break;
      case "replaceLabel":
        await ctx.db.replace(write.rowId, write.value);
        break;
      case "deleteLabel":
        await ctx.db.delete(write.rowId);
        break;
    }
  }
};

const operationFloorId = (operation: OperationInput): string | undefined => {
  switch (operation.kind) {
    case "device.create":
    case "device.place":
      return operation.device.floorId;
    case "walls.add":
      return operation.walls[0]?.floorId;
    case "overlay.set":
    case "overlay.patch":
      return operation.floorId;
    case "label.create":
      return operation.label.floorId;
    case "batch":
      return operation.operations[0]
        ? operationFloorId({
            ...operation.operations[0],
            meta: operation.meta,
          })
        : undefined;
    case "device.patch":
    case "device.delete":
    case "device.unplace":
    case "walls.delete":
    case "label.patch":
    case "label.delete":
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
    : "Une modification ne peut toucher qu'un seul étage.";

const clientOperationResult = (operation: Doc<"clientOperations">) => ({
  status: operation.status,
  opId: operation.opId,
  appliedRevision: operation.appliedRevision,
  floorId: operation.floorId,
  error: operation.error,
});

export const observePending = readerQuery({
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

/**
 * Validates and applies one operation exactly as `apply` does, for server code
 * that writes map content (the dev seed) and must obey the same rules.
 */
export const applyMapOperation = async (
  ctx: MutationCtx,
  operation: OperationInput,
): Promise<Infer<typeof mapOperationResult>> => {
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
    await syncOverlayFileReleases(ctx, state.touchedOverlayFileIds, now);
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
};

export const apply = editorMutation({
  args: { operation: mapOperation },
  returns: mapOperationResult,
  handler: async (ctx, { operation }) =>
    await applyMapOperation(ctx, operation),
});
