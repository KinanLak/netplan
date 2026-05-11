import { useRef } from "react";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation, useQuery } from "convex/react";
import { useMapStore } from "@/store/useMapStore";
import {
  buildAddDeviceInverse,
  buildAddWallsInverse,
  buildDeleteDeviceInverse,
  buildEraseWallsInverse,
  buildMoveDeviceInverse,
} from "@/store/mapHistory";
import type {
  Device,
  DeviceDraft,
  DeviceId,
  FloorId,
  InverseCommand,
  Position,
  RoomDraft,
  Size,
  WallId,
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

const TEMP_WALL_PREFIX = "temp-wall";

const tempWallId = (operationId: string, index: number) =>
  `${TEMP_WALL_PREFIX}-${operationId}-${index}` as unknown as Id<"walls">;
const tempDeviceId = () => tempId("temp-device") as unknown as Id<"devices">;

const parseTempWallId = (
  id: string,
): { operationId: string; index: number } | null => {
  const match = new RegExp(`^${TEMP_WALL_PREFIX}-(.+)-(\\d+)$`).exec(id);
  if (!match) return null;
  const index = Number(match[2]);
  if (!Number.isInteger(index)) return null;
  return { operationId: match[1], index };
};

const unchangedWallResult = (
  walls: Array<WallSegment>,
  reason: WallCommandResult["reason"],
): WallCommandResult => ({
  changed: false,
  nextWalls: walls,
  affectedKeys: [],
  reason,
});

type HistorySlot =
  | { kind: "single"; token: number }
  | { kind: "group"; group: HistoryGroup; index: number };

interface HistoryGroup {
  token: number;
  commands: Array<InverseCommand | null>;
  pending: number;
  closed: boolean;
}

interface PendingWallAdd {
  canceledIndexes: Set<number>;
}

const toHistoryCommand = (
  commands: ReadonlyArray<InverseCommand | null>,
): InverseCommand | null => {
  const compact = commands.filter(
    (command): command is InverseCommand => command !== null,
  );
  if (compact.length === 0) return null;
  if (compact.length === 1) return compact[0];
  return { kind: "batch", commands: compact };
};

export interface MapCommands {
  devices: Array<Device>;
  walls: Array<WallSegment>;
  isReady: boolean;
  addDevice: (draft: DeviceDraft) => void;
  updateDevicePosition: (deviceId: DeviceId, position: Position) => void;
  deleteDevice: (deviceId: DeviceId) => void;
  checkCollision: (
    floorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
  ) => boolean;
  addWallLine: (line: WallDraft) => WallCommandResult;
  addWallRoom: (room: RoomDraft) => WallCommandResult;
  eraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  eraseWallStroke: (input: WallStrokeInput) => WallCommandResult;
  previewEraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  beginHistoryGroup: () => void;
  endHistoryGroup: () => void;
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
    clientOperationId?: string;
    segments: ReadonlyArray<{
      start: Position;
      end: Position;
      color: WallSegment["color"];
    }>;
  },
) => {
  const list =
    store.getQuery(api.walls.listForFloor, { floorId: args.floorId }) ?? [];
  const operationId = args.clientOperationId ?? tempId("wall-add");
  const optimistic: Array<WallSegment> = args.segments.map(
    (segment, index) => ({
      _id: tempWallId(operationId, index),
      _creationTime: Date.now(),
      floorId: args.floorId,
      start: segment.start,
      end: segment.end,
      color: segment.color,
    }),
  );
  store.setQuery(api.walls.listForFloor, { floorId: args.floorId }, [
    ...list,
    ...optimistic,
  ]);
};

const applyEraseStrokeOptimistic = (
  store: OptimisticLocalStore,
  args: {
    floorId: FloorId;
    removeIds: ReadonlyArray<Id<"walls">>;
    canceledTempIds?: ReadonlyArray<string>;
  },
) => {
  const list =
    store.getQuery(api.walls.listForFloor, { floorId: args.floorId }) ?? [];
  const ids = new Set<string>([
    ...args.removeIds,
    ...(args.canceledTempIds ?? []),
  ]);
  store.setQuery(
    api.walls.listForFloor,
    { floorId: args.floorId },
    list.filter((wall) => !ids.has(wall._id)),
  );
};

export function useMapCommands(floorId: FloorId | null): MapCommands {
  const queriedDevices = useQuery(
    api.devices.listForFloor,
    floorId ? { floorId } : "skip",
  );
  const devices = queriedDevices ?? EMPTY_DEVICES;

  const queriedWalls = useQuery(
    api.walls.listForFloor,
    floorId ? { floorId } : "skip",
  );
  const walls = queriedWalls ?? EMPTY_WALLS;
  const isReady =
    floorId !== null &&
    queriedDevices !== undefined &&
    queriedWalls !== undefined;

  const pushHistory = useMapStore((s) => s.pushHistory);
  const nextHistoryTokenRef = useRef(0);
  const nextFlushTokenRef = useRef(0);
  const completedHistoryRef = useRef(new Map<number, InverseCommand | null>());
  const activeHistoryGroupRef = useRef<HistoryGroup | null>(null);
  const pendingWallAddsRef = useRef(new Map<string, PendingWallAdd>());

  const reserveHistoryToken = () => {
    const token = nextHistoryTokenRef.current;
    nextHistoryTokenRef.current += 1;
    return token;
  };

  const flushCompletedHistory = () => {
    const completed = completedHistoryRef.current;
    while (completed.has(nextFlushTokenRef.current)) {
      const command = completed.get(nextFlushTokenRef.current) ?? null;
      completed.delete(nextFlushTokenRef.current);
      nextFlushTokenRef.current += 1;
      if (command) pushHistory(command);
    }
  };

  const completeHistoryToken = (
    token: number,
    command: InverseCommand | null,
  ) => {
    completedHistoryRef.current.set(token, command);
    flushCompletedHistory();
  };

  const flushHistoryGroup = (group: HistoryGroup) => {
    if (!group.closed || group.pending > 0) return;
    completeHistoryToken(group.token, toHistoryCommand(group.commands));
  };

  const reserveHistorySlot = (): HistorySlot => {
    const group = activeHistoryGroupRef.current;
    if (!group) return { kind: "single", token: reserveHistoryToken() };

    const index = group.commands.length;
    group.commands.push(null);
    group.pending += 1;
    return { kind: "group", group, index };
  };

  const completeHistorySlot = (
    slot: HistorySlot,
    command: InverseCommand | null,
  ) => {
    if (slot.kind === "single") {
      completeHistoryToken(slot.token, command);
      return;
    }

    slot.group.commands[slot.index] = command;
    slot.group.pending -= 1;
    flushHistoryGroup(slot.group);
  };

  const beginHistoryGroup = () => {
    if (activeHistoryGroupRef.current) return;
    activeHistoryGroupRef.current = {
      token: reserveHistoryToken(),
      commands: [],
      pending: 0,
      closed: false,
    };
  };

  const endHistoryGroup = () => {
    const group = activeHistoryGroupRef.current;
    if (!group) return;
    group.closed = true;
    activeHistoryGroupRef.current = null;
    flushHistoryGroup(group);
  };

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
    if (!isReady) return;
    const slot = reserveHistorySlot();
    void (async () => {
      try {
        const newId = await createDeviceMutation({
          floorId: draft.floorId,
          type: draft.type,
          name: draft.name,
          hostname: draft.hostname,
          position: draft.position,
          size: draft.size,
          metadata: draft.metadata,
        });
        completeHistorySlot(slot, buildAddDeviceInverse(draft, newId));
      } catch (error) {
        console.error("add device failed", error);
        completeHistorySlot(slot, null);
      }
    })();
  };

  const updateDevicePosition = (deviceId: DeviceId, position: Position) => {
    if (!isReady) return;
    const previous = devices.find((d) => d._id === deviceId);
    if (!previous) return;
    const previousPosition = previous.position;
    if (
      previousPosition.x === position.x &&
      previousPosition.y === position.y
    ) {
      return;
    }
    const slot = reserveHistorySlot();
    void (async () => {
      try {
        await updatePositionMutation({ id: deviceId, position });
        completeHistorySlot(
          slot,
          buildMoveDeviceInverse(deviceId, previousPosition, position),
        );
      } catch (error) {
        console.error("move device failed", error);
        completeHistorySlot(slot, null);
      }
    })();
  };

  const deleteDevice = (deviceId: DeviceId) => {
    if (!isReady) return;
    const device = devices.find((d) => d._id === deviceId);
    if (!device) return;
    const slot = reserveHistorySlot();
    void (async () => {
      try {
        const removed = await removeDeviceMutation({ id: deviceId });
        completeHistorySlot(slot, buildDeleteDeviceInverse(removed));
      } catch (error) {
        console.error("delete device failed", error);
        completeHistorySlot(slot, null);
      }
    })();
  };

  const checkCollision = (
    targetFloorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
  ): boolean => {
    if (!isReady) return true;

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
    const slot = reserveHistorySlot();
    const clientOperationId = tempId("wall-add");
    pendingWallAddsRef.current.set(clientOperationId, {
      canceledIndexes: new Set<number>(),
    });
    const segments = added.map((segment) => ({
      start: segment.start,
      end: segment.end,
      color: segment.color,
    }));
    void (async () => {
      try {
        const newIds = await addStrokeMutation({
          floorId: targetFloorId,
          clientOperationId,
          segments,
        });
        const pending = pendingWallAddsRef.current.get(clientOperationId);
        pendingWallAddsRef.current.delete(clientOperationId);
        const activeIds: Array<WallId> = [];
        const activeSegments: typeof segments = [];
        const canceledIds: Array<WallId> = [];

        newIds.forEach((id, index) => {
          const segment = segments[index];
          if (pending?.canceledIndexes.has(index)) {
            canceledIds.push(id);
            return;
          }
          activeIds.push(id);
          activeSegments.push(segment);
        });

        if (canceledIds.length > 0) {
          await eraseStrokeMutation({
            floorId: targetFloorId,
            removeIds: canceledIds,
          });
        }

        completeHistorySlot(
          slot,
          activeIds.length > 0
            ? buildAddWallsInverse(targetFloorId, activeIds, activeSegments)
            : null,
        );
      } catch (error) {
        console.error("add wall stroke failed", error);
        pendingWallAddsRef.current.delete(clientOperationId);
        completeHistorySlot(slot, null);
      }
    })();
  };

  const flushErasedIds = (
    targetFloorId: FloorId,
    floorWallsBefore: Array<WallSegment>,
    nextWalls: Array<WallSegment>,
  ) => {
    const remainingIds = new Set<string>(nextWalls.map((wall) => wall._id));
    const removed = floorWallsBefore.filter(
      (wall) => !remainingIds.has(wall._id),
    );
    if (removed.length === 0) return;

    const canceledTempIds: Array<string> = [];
    const realRemoved: Array<WallSegment> = [];
    for (const wall of removed) {
      const temp = parseTempWallId(wall._id);
      if (!temp) {
        realRemoved.push(wall);
        continue;
      }
      canceledTempIds.push(wall._id);
      const pending = pendingWallAddsRef.current.get(temp.operationId);
      pending?.canceledIndexes.add(temp.index);
    }

    if (realRemoved.length === 0) {
      void eraseStrokeMutation({
        floorId: targetFloorId,
        removeIds: [],
        canceledTempIds,
      }).catch((error) => {
        console.error("cancel optimistic wall erase failed", error);
      });
      return;
    }

    const removedIds = realRemoved.map((wall) => wall._id) as Array<
      Id<"walls">
    >;
    const inverse = buildEraseWallsInverse(targetFloorId, realRemoved);
    const slot = reserveHistorySlot();
    void (async () => {
      try {
        await eraseStrokeMutation({
          floorId: targetFloorId,
          removeIds: removedIds,
          canceledTempIds,
        });
        completeHistorySlot(slot, inverse);
      } catch (error) {
        console.error("erase wall stroke failed", error);
        completeHistorySlot(slot, null);
      }
    })();
  };

  const addWallLine = (line: WallDraft): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === line.floorId);
    if (!isReady) return unchangedWallResult(floorWalls, "invalid-line");

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
    if (!isReady) return unchangedWallResult(floorWalls, "invalid-room");

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
    if (!isReady) return unchangedWallResult(floorWalls, "no-wall-at-pointer");

    const result = eraseAtPointer({
      walls: floorWalls,
      floorId: input.floorId,
      pointer: input.pointer,
      snappedPoint: input.snappedPoint,
    });

    if (result.changed) {
      flushErasedIds(input.floorId, floorWalls, result.nextWalls);
    }
    return result;
  };

  const eraseWallStrokeCmd = (input: WallStrokeInput): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === input.floorId);
    if (!isReady) return unchangedWallResult(floorWalls, "empty-stroke");

    const result = eraseStroke({
      walls: floorWalls,
      floorId: input.floorId,
      fromPointer: input.fromPointer,
      fromSnappedPoint: input.fromSnappedPoint,
      toPointer: input.toPointer,
      toSnappedPoint: input.toSnappedPoint,
    });

    if (result.changed) {
      flushErasedIds(input.floorId, floorWalls, result.nextWalls);
    }
    return result;
  };

  const previewEraseWallAtPointerCmd = (
    input: WallPointerInput,
  ): WallCommandResult => {
    const floorWalls = walls.filter((w) => w.floorId === input.floorId);
    if (!isReady) return unchangedWallResult(floorWalls, "preview-miss");

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
    isReady,
    addDevice,
    updateDevicePosition,
    deleteDevice,
    checkCollision,
    addWallLine,
    addWallRoom,
    eraseWallAtPointer: eraseWallAtPointerCmd,
    eraseWallStroke: eraseWallStrokeCmd,
    previewEraseWallAtPointer: previewEraseWallAtPointerCmd,
    beginHistoryGroup,
    endHistoryGroup,
  };
}
