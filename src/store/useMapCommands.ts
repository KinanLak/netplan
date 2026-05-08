import type { OptimisticLocalStore } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import type {
  Device,
  DeviceDraft,
  DeviceId,
  FloorId,
  Position,
  RoomDraft,
  Size,
  WallCommandResult,
  WallDraft,
  WallPointerInput,
  WallSegment,
  WallStrokeInput,
} from "@/types/map";
import {
  addLine,
  addRoom,
  eraseAtPointer,
  eraseStroke,
  previewEraseAtPointer,
} from "@/walls/engine";
import {
  getWallCollisionRect,
  wallCollidesWithDevices,
} from "@/walls/gridGeometry";
import { rectanglesOverlap } from "@/lib/geometry";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const tempId = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const tempWallId = () => tempId("temp-wall") as unknown as Id<"walls">;
const tempDeviceId = () => tempId("temp-device") as unknown as Id<"devices">;

export interface MapCommands {
  devices: Array<Device>;
  walls: Array<WallSegment>;
  isReady: boolean;
  addDevice: (draft: DeviceDraft) => void;
  updateDevicePosition: (deviceId: DeviceId, position: Position) => void;
  deleteDevice: (deviceId: DeviceId) => void;
  checkCollision: (
    floorId: FloorId,
    deviceId: DeviceId | string,
    position: Position,
    size: Size,
  ) => boolean;
  addWallLine: (line: WallDraft) => WallCommandResult;
  addWallRoom: (room: RoomDraft) => WallCommandResult;
  eraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  eraseWallStroke: (input: WallStrokeInput) => WallCommandResult;
  previewEraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
}

const EMPTY_DEVICES: Array<Device> = [];
const EMPTY_WALLS: Array<WallSegment> = [];

const applyCreateDeviceOptimistic = (
  store: OptimisticLocalStore,
  args: {
    floorId: FloorId;
    type: Device["type"];
    name: string;
    hostname?: string;
    position: Position;
    size: Size;
    metadata: Device["metadata"];
  },
) => {
  const list =
    store.getQuery(api.devices.listForFloor, { floorId: args.floorId }) ?? [];
  const optimistic: Device = {
    _id: tempDeviceId(),
    _creationTime: Date.now(),
    floorId: args.floorId,
    type: args.type,
    name: args.name,
    hostname: args.hostname,
    position: args.position,
    size: args.size,
    metadata: args.metadata,
  };
  store.setQuery(api.devices.listForFloor, { floorId: args.floorId }, [
    ...list,
    optimistic,
  ]);
};

const applyUpdatePositionOptimistic = (
  store: OptimisticLocalStore,
  floorId: FloorId | null,
  args: { id: DeviceId; position: Position },
) => {
  if (!floorId) return;
  const list = store.getQuery(api.devices.listForFloor, { floorId }) ?? [];
  const next = list.map((d) =>
    d._id === args.id ? { ...d, position: args.position } : d,
  );
  store.setQuery(api.devices.listForFloor, { floorId }, next);
};

const applyRemoveDeviceOptimistic = (
  store: OptimisticLocalStore,
  floorId: FloorId | null,
  args: { id: DeviceId },
) => {
  if (!floorId) return;
  const list = store.getQuery(api.devices.listForFloor, { floorId }) ?? [];
  store.setQuery(
    api.devices.listForFloor,
    { floorId },
    list.filter((d) => d._id !== args.id),
  );
};

const applyAddStrokeOptimistic = (
  store: OptimisticLocalStore,
  args: {
    floorId: FloorId;
    segments: ReadonlyArray<{
      start: Position;
      end: Position;
      color: WallSegment["color"];
    }>;
  },
) => {
  const list =
    store.getQuery(api.walls.listForFloor, { floorId: args.floorId }) ?? [];
  const optimistic: Array<WallSegment> = args.segments.map((segment) => ({
    _id: tempWallId(),
    _creationTime: Date.now(),
    floorId: args.floorId,
    start: segment.start,
    end: segment.end,
    color: segment.color,
  }));
  store.setQuery(api.walls.listForFloor, { floorId: args.floorId }, [
    ...list,
    ...optimistic,
  ]);
};

const applyEraseStrokeOptimistic = (
  store: OptimisticLocalStore,
  args: { floorId: FloorId; removeIds: ReadonlyArray<Id<"walls">> },
) => {
  const list =
    store.getQuery(api.walls.listForFloor, { floorId: args.floorId }) ?? [];
  const ids = new Set<string>(args.removeIds);
  store.setQuery(
    api.walls.listForFloor,
    { floorId: args.floorId },
    list.filter((wall) => !ids.has(wall._id)),
  );
};

export function useMapCommands(floorId: FloorId | null): MapCommands {
  const devices =
    useQuery(api.devices.listForFloor, floorId ? { floorId } : "skip") ??
    EMPTY_DEVICES;

  const walls =
    useQuery(api.walls.listForFloor, floorId ? { floorId } : "skip") ??
    EMPTY_WALLS;

  const createDeviceMutation = useMutation(
    api.devices.create,
  ).withOptimisticUpdate(applyCreateDeviceOptimistic);

  const updatePositionMutation = useMutation(
    api.devices.updatePosition,
  ).withOptimisticUpdate((store, args) => {
    applyUpdatePositionOptimistic(store, floorId, args);
  });

  const removeDeviceMutation = useMutation(
    api.devices.remove,
  ).withOptimisticUpdate((store, args) => {
    applyRemoveDeviceOptimistic(store, floorId, args);
  });

  const addStrokeMutation = useMutation(
    api.walls.addStroke,
  ).withOptimisticUpdate(applyAddStrokeOptimistic);

  const eraseStrokeMutation = useMutation(
    api.walls.eraseStroke,
  ).withOptimisticUpdate(applyEraseStrokeOptimistic);

  const addDevice = (draft: DeviceDraft) => {
    void createDeviceMutation({
      floorId: draft.floorId,
      type: draft.type,
      name: draft.name,
      hostname: draft.hostname,
      position: draft.position,
      size: draft.size,
      metadata: draft.metadata,
    });
  };

  const updateDevicePosition = (deviceId: DeviceId, position: Position) => {
    void updatePositionMutation({ id: deviceId, position });
  };

  const deleteDevice = (deviceId: DeviceId) => {
    void removeDeviceMutation({ id: deviceId });
  };

  const checkCollision = (
    targetFloorId: FloorId,
    deviceId: DeviceId | string,
    position: Position,
    size: Size,
  ): boolean => {
    for (const other of devices) {
      if (other.floorId !== targetFloorId) continue;
      if (other._id === deviceId) continue;
      if (rectanglesOverlap(position, size, other.position, other.size)) {
        return true;
      }
    }
    for (const wall of walls) {
      if (wall.floorId !== targetFloorId) continue;
      const rect = getWallCollisionRect(wall);
      if (
        rectanglesOverlap(
          position,
          size,
          { x: rect.x, y: rect.y },
          { width: rect.width, height: rect.height },
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const flushAddedSegments = (
    targetFloorId: FloorId,
    existingIds: Set<string>,
    nextWalls: Array<WallSegment>,
  ) => {
    const added = nextWalls.filter((wall) => !existingIds.has(wall._id));
    if (added.length === 0) return;
    void addStrokeMutation({
      floorId: targetFloorId,
      segments: added.map((segment) => ({
        start: segment.start,
        end: segment.end,
        color: segment.color,
      })),
    });
  };

  const flushErasedIds = (
    targetFloorId: FloorId,
    existingIds: Set<string>,
    nextWalls: Array<WallSegment>,
  ) => {
    const remainingIds = new Set<string>(nextWalls.map((wall) => wall._id));
    const removed: Array<Id<"walls">> = [];
    for (const id of existingIds) {
      if (!remainingIds.has(id)) {
        removed.push(id as Id<"walls">);
      }
    }
    if (removed.length === 0) return;
    void eraseStrokeMutation({ floorId: targetFloorId, removeIds: removed });
  };

  const addWallLine = (line: WallDraft): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === line.floorId);
    const floorDevices = devices.filter((d) => d.floorId === line.floorId);
    const existingIds = new Set(floorWalls.map((w) => w._id));

    const result = addLine({
      walls: floorWalls,
      floorId: line.floorId,
      color: line.color,
      start: line.start,
      end: line.end,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevices),
    });

    if (result.changed) {
      flushAddedSegments(line.floorId, existingIds, result.nextWalls);
    }
    return result;
  };

  const addWallRoom = (room: RoomDraft): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === room.floorId);
    const floorDevices = devices.filter((d) => d.floorId === room.floorId);
    const existingIds = new Set(floorWalls.map((w) => w._id));

    const result = addRoom({
      walls: floorWalls,
      floorId: room.floorId,
      color: room.color,
      start: room.start,
      end: room.end,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevices),
    });

    if (result.changed) {
      flushAddedSegments(room.floorId, existingIds, result.nextWalls);
    }
    return result;
  };

  const eraseWallAtPointerCmd = (
    input: WallPointerInput,
  ): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === input.floorId);
    const existingIds = new Set(floorWalls.map((w) => w._id));

    const result = eraseAtPointer({
      walls: floorWalls,
      floorId: input.floorId,
      pointer: input.pointer,
      snappedPoint: input.snappedPoint,
    });

    if (result.changed) {
      flushErasedIds(input.floorId, existingIds, result.nextWalls);
    }
    return result;
  };

  const eraseWallStrokeCmd = (input: WallStrokeInput): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === input.floorId);
    const existingIds = new Set(floorWalls.map((w) => w._id));

    const result = eraseStroke({
      walls: floorWalls,
      floorId: input.floorId,
      fromPointer: input.fromPointer,
      fromSnappedPoint: input.fromSnappedPoint,
      toPointer: input.toPointer,
      toSnappedPoint: input.toSnappedPoint,
    });

    if (result.changed) {
      flushErasedIds(input.floorId, existingIds, result.nextWalls);
    }
    return result;
  };

  const previewEraseWallAtPointerCmd = (
    input: WallPointerInput,
  ): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === input.floorId);
    return previewEraseAtPointer({
      walls: floorWalls,
      floorId: input.floorId,
      pointer: input.pointer,
      snappedPoint: input.snappedPoint,
    });
  };

  return {
    devices,
    walls,
    isReady: floorId !== null,
    addDevice,
    updateDevicePosition,
    deleteDevice,
    checkCollision,
    addWallLine,
    addWallRoom,
    eraseWallAtPointer: eraseWallAtPointerCmd,
    eraseWallStroke: eraseWallStrokeCmd,
    previewEraseWallAtPointer: previewEraseWallAtPointerCmd,
  };
}
