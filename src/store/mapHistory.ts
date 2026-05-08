import type {
  Device,
  DeviceDraft,
  DeviceId,
  FloorId,
  InverseCommand,
  Position,
  WallColor,
  WallId,
  WallSegment,
  WallSegmentSnapshot,
} from "@/types/map";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";

export interface InverseCommandRunners {
  createDevice: (draft: DeviceDraft) => Promise<DeviceId>;
  removeDevice: (args: { id: DeviceId }) => Promise<unknown>;
  updatePosition: (args: {
    id: DeviceId;
    position: Position;
  }) => Promise<unknown>;
  addStroke: (args: {
    floorId: FloorId;
    segments: Array<WallSegmentSnapshot>;
  }) => Promise<Array<WallId>>;
  eraseStroke: (args: {
    floorId: FloorId;
    removeIds: Array<WallId>;
  }) => Promise<unknown>;
}

export const executeInverseCommand = async (
  command: InverseCommand,
  runners: InverseCommandRunners,
): Promise<InverseCommand> => {
  switch (command.kind) {
    case "createDevice": {
      const id = await runners.createDevice(command.draft);
      return { kind: "removeDevice", deviceId: id, snapshot: command.draft };
    }
    case "removeDevice": {
      await runners.removeDevice({ id: command.deviceId });
      return { kind: "createDevice", draft: command.snapshot };
    }
    case "moveDevice": {
      await runners.updatePosition({
        id: command.deviceId,
        position: command.to,
      });
      return {
        kind: "moveDevice",
        deviceId: command.deviceId,
        from: command.to,
        to: command.from,
      };
    }
    case "addWalls": {
      const segments = [...command.segments];
      const ids = await runners.addStroke({
        floorId: command.floorId,
        segments,
      });
      return {
        kind: "removeWalls",
        floorId: command.floorId,
        ids,
        snapshots: segments,
      };
    }
    case "removeWalls": {
      await runners.eraseStroke({
        floorId: command.floorId,
        removeIds: [...command.ids],
      });
      return {
        kind: "addWalls",
        floorId: command.floorId,
        segments: [...command.snapshots],
      };
    }
  }
};

export const buildAddDeviceInverse = (
  draft: DeviceDraft,
  newId: DeviceId,
): InverseCommand => ({
  kind: "removeDevice",
  deviceId: newId,
  snapshot: draft,
});

export const buildDeleteDeviceInverse = (device: Device): InverseCommand => ({
  kind: "createDevice",
  draft: {
    floorId: device.floorId,
    type: device.type,
    name: device.name,
    hostname: device.hostname,
    position: device.position,
    size: device.size,
    metadata: device.metadata,
  },
});

export const buildMoveDeviceInverse = (
  deviceId: DeviceId,
  previousPosition: Position,
  nextPosition: Position,
): InverseCommand => ({
  kind: "moveDevice",
  deviceId,
  from: nextPosition,
  to: previousPosition,
});

export const buildAddWallsInverse = (
  floorId: FloorId,
  ids: ReadonlyArray<WallId>,
  segments: ReadonlyArray<WallSegmentSnapshot>,
): InverseCommand => ({
  kind: "removeWalls",
  floorId,
  ids,
  snapshots: segments,
});

export const buildEraseWallsInverse = (
  floorId: FloorId,
  removed: ReadonlyArray<WallSegment>,
): InverseCommand => ({
  kind: "addWalls",
  floorId,
  segments: removed.map((wall) => ({
    start: wall.start,
    end: wall.end,
    color: wall.color,
  })),
});

export const dispatchUndoRedoEvent = (type: "undo" | "redo") => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UNDO_REDO_EVENT_NAME, { detail: { type } }),
  );
};

// Re-export to keep colour types stable across the history surface.
export type { InverseCommand, WallSegmentSnapshot, WallColor };
