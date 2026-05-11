import type {
  Device,
  DeviceDraft,
  DeviceId,
  DeviceRemovalSnapshot,
  FloorId,
  InverseCommand,
  LinkId,
  LinkSnapshot,
  Position,
  WallColor,
  WallId,
  WallSegment,
  WallSegmentSnapshot,
} from "@/types/map";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";

export interface InverseCommandRunners {
  createDevice: (draft: DeviceDraft) => Promise<DeviceId>;
  removeDevice: (args: { id: DeviceId }) => Promise<DeviceRemovalSnapshot>;
  updatePosition: (args: {
    id: DeviceId;
    position: Position;
  }) => Promise<unknown>;
  createLink: (snapshot: LinkSnapshot) => Promise<LinkId>;
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
    case "batch": {
      const nextCommands: Array<InverseCommand> = [];
      for (let index = command.commands.length - 1; index >= 0; index -= 1) {
        const nextCommand = await executeInverseCommand(
          command.commands[index],
          runners,
        );
        nextCommands.unshift(nextCommand);
      }
      return { kind: "batch", commands: nextCommands };
    }
    case "createDevice": {
      const id = await runners.createDevice(command.draft);
      const links = remapLinkSnapshots(
        command.links ?? [],
        command.originalDeviceId,
        id,
      );
      const restoredLinks: Array<LinkSnapshot> = [];
      for (const link of links) {
        try {
          await runners.createLink(link);
          restoredLinks.push(link);
        } catch (error) {
          console.error("link restore failed", error);
        }
      }
      return {
        kind: "removeDevice",
        deviceId: id,
        snapshot: command.draft,
        originalDeviceId: id,
        links: restoredLinks,
      };
    }
    case "removeDevice": {
      const removed = await runners.removeDevice({ id: command.deviceId });
      return {
        kind: "createDevice",
        draft: removed.draft,
        originalDeviceId: removed.deviceId,
        links: removed.links,
      };
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

const remapLinkSnapshots = (
  links: ReadonlyArray<LinkSnapshot>,
  fromDeviceId: DeviceId | undefined,
  toDeviceId: DeviceId,
): Array<LinkSnapshot> => {
  if (!fromDeviceId) return [...links];

  return links.map((link) => ({
    ...link,
    fromDeviceId:
      link.fromDeviceId === fromDeviceId ? toDeviceId : link.fromDeviceId,
    toDeviceId: link.toDeviceId === fromDeviceId ? toDeviceId : link.toDeviceId,
  }));
};

export const buildAddDeviceInverse = (
  draft: DeviceDraft,
  newId: DeviceId,
): InverseCommand => ({
  kind: "removeDevice",
  deviceId: newId,
  snapshot: draft,
  originalDeviceId: newId,
  links: [],
});

const deviceToRemovalSnapshot = (device: Device): DeviceRemovalSnapshot => ({
  deviceId: device._id,
  draft: {
    floorId: device.floorId,
    type: device.type,
    name: device.name,
    hostname: device.hostname,
    position: device.position,
    size: device.size,
    metadata: device.metadata,
  },
  links: [],
});

export const buildDeleteDeviceInverse = (
  snapshot: Device | DeviceRemovalSnapshot,
): InverseCommand => {
  const removalSnapshot =
    "_id" in snapshot ? deviceToRemovalSnapshot(snapshot) : snapshot;

  return {
    kind: "createDevice",
    draft: removalSnapshot.draft,
    originalDeviceId: removalSnapshot.deviceId,
    links: removalSnapshot.links,
  };
};

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
