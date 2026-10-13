import type {
  Device,
  FloorId,
  MapDocumentSnapshot,
  Position,
} from "../types/map";

const GRID_SIZE = 20;

const rectanglesOverlap = (
  pos1: Position,
  size1: Device["size"],
  pos2: Position,
  size2: Device["size"],
): boolean =>
  !(
    pos1.x + size1.width <= pos2.x ||
    pos2.x + size2.width <= pos1.x ||
    pos1.y + size1.height <= pos2.y ||
    pos2.y + size2.height <= pos1.y
  );

const wallCollisionRect = (wall: MapDocumentSnapshot["walls"][number]) => {
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

export interface SystemDeviceRelocationOperation {
  kind: "system.device.relocate";
  origin: "integration";
  expectedCycleId: string;
  device: Device;
  source: {
    floorId: FloorId;
    position: Position;
  } | null;
  target: {
    floorId: FloorId;
    position: Position;
  };
}

export type SystemDeviceRelocationEffect =
  | "device-created"
  | "device-moved"
  | "device-removed"
  | "device-added";

export interface SystemDeviceRelocationAffectedFloor {
  floorId: FloorId;
  effect: SystemDeviceRelocationEffect;
  before: MapDocumentSnapshot;
  after: MapDocumentSnapshot;
}

export type SystemDeviceRelocationReason =
  | "already-applied"
  | "source-mismatch"
  | "missing-source-floor"
  | "missing-target-floor"
  | "blocked-by-links"
  | "device-collision"
  | "wall-collision";

export interface SystemDeviceRelocationResult {
  snapshots: ReadonlyArray<MapDocumentSnapshot>;
  applied: boolean;
  affectedFloors: Array<SystemDeviceRelocationAffectedFloor>;
  reason?: SystemDeviceRelocationReason;
}

const samePosition = (left: Position, right: Position): boolean =>
  left.x === right.x && left.y === right.y;

const sameDevice = (left: Device, right: Device): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const getPlacementCollision = (
  snapshot: MapDocumentSnapshot,
  device: Device,
): "device-collision" | "wall-collision" | null => {
  if (
    snapshot.devices.some(
      (other) =>
        other.id !== device.id &&
        other.floorId === device.floorId &&
        rectanglesOverlap(
          device.position,
          device.size,
          other.position,
          other.size,
        ),
    )
  ) {
    return "device-collision";
  }
  if (
    snapshot.walls.some((wall) => {
      if (wall.floorId !== device.floorId) return false;
      const rect = wallCollisionRect(wall);
      return rectanglesOverlap(
        device.position,
        device.size,
        { x: rect.x, y: rect.y },
        { width: rect.width, height: rect.height },
      );
    })
  ) {
    return "wall-collision";
  }
  return null;
};

const unchanged = (
  snapshots: ReadonlyArray<MapDocumentSnapshot>,
  reason: SystemDeviceRelocationReason,
): SystemDeviceRelocationResult => ({
  snapshots,
  applied: false,
  affectedFloors: [],
  reason,
});

export function applySystemDeviceRelocation(
  snapshots: ReadonlyArray<MapDocumentSnapshot>,
  operation: SystemDeviceRelocationOperation,
): SystemDeviceRelocationResult {
  const targetSnapshot = snapshots.find(
    (snapshot) => snapshot.floorId === operation.target.floorId,
  );
  if (!targetSnapshot) return unchanged(snapshots, "missing-target-floor");

  const expectedSource = operation.source;
  const sourceSnapshot = expectedSource
    ? snapshots.find((snapshot) => snapshot.floorId === expectedSource.floorId)
    : null;
  if (expectedSource && !sourceSnapshot) {
    return unchanged(snapshots, "missing-source-floor");
  }

  const occurrences = snapshots.flatMap((snapshot) =>
    snapshot.devices
      .filter((device) => device.id === operation.device.id)
      .map((device) => ({ snapshot, device })),
  );
  if (occurrences.length > 1) return unchanged(snapshots, "source-mismatch");

  const existing = occurrences.at(0);
  const creationDevice = {
    ...operation.device,
    floorId: operation.target.floorId,
    position: operation.target.position,
  };

  if (
    existing?.snapshot.floorId === operation.target.floorId &&
    samePosition(existing.device.position, operation.target.position)
  ) {
    if (expectedSource || sameDevice(existing.device, creationDevice)) {
      return unchanged(snapshots, "already-applied");
    }
    return unchanged(snapshots, "source-mismatch");
  }

  if (!expectedSource) {
    if (existing) return unchanged(snapshots, "source-mismatch");

    const collision = getPlacementCollision(targetSnapshot, creationDevice);
    if (collision) return unchanged(snapshots, collision);

    const after = {
      ...targetSnapshot,
      devices: [...targetSnapshot.devices, creationDevice],
    };
    return {
      snapshots: snapshots.map((snapshot) =>
        snapshot === targetSnapshot ? after : snapshot,
      ),
      applied: true,
      affectedFloors: [
        {
          floorId: targetSnapshot.floorId,
          effect: "device-created",
          before: targetSnapshot,
          after,
        },
      ],
    };
  }

  if (
    !existing ||
    existing.snapshot !== sourceSnapshot ||
    !samePosition(existing.device.position, expectedSource.position)
  ) {
    return unchanged(snapshots, "source-mismatch");
  }

  const relocatedDevice = {
    ...existing.device,
    floorId: operation.target.floorId,
    position: operation.target.position,
  };
  const collision = getPlacementCollision(targetSnapshot, relocatedDevice);
  if (collision) return unchanged(snapshots, collision);

  if (sourceSnapshot === targetSnapshot) {
    const after = {
      ...sourceSnapshot,
      devices: sourceSnapshot.devices.map((device) =>
        device.id === existing.device.id ? relocatedDevice : device,
      ),
    };
    return {
      snapshots: snapshots.map((snapshot) =>
        snapshot === sourceSnapshot ? after : snapshot,
      ),
      applied: true,
      affectedFloors: [
        {
          floorId: sourceSnapshot.floorId,
          effect: "device-moved",
          before: sourceSnapshot,
          after,
        },
      ],
    };
  }

  const hasConnectedLinks = sourceSnapshot.links.some(
    (link) =>
      link.fromDeviceId === existing.device.id ||
      link.toDeviceId === existing.device.id,
  );
  if (hasConnectedLinks) return unchanged(snapshots, "blocked-by-links");

  const sourceAfter = {
    ...sourceSnapshot,
    devices: sourceSnapshot.devices.filter(
      (device) => device.id !== existing.device.id,
    ),
  };
  const targetAfter = {
    ...targetSnapshot,
    devices: [...targetSnapshot.devices, relocatedDevice],
  };

  return {
    snapshots: snapshots.map((snapshot) => {
      if (snapshot === sourceSnapshot) return sourceAfter;
      if (snapshot === targetSnapshot) return targetAfter;
      return snapshot;
    }),
    applied: true,
    affectedFloors: [
      {
        floorId: sourceSnapshot.floorId,
        effect: "device-removed",
        before: sourceSnapshot,
        after: sourceAfter,
      },
      {
        floorId: targetSnapshot.floorId,
        effect: "device-added",
        before: targetSnapshot,
        after: targetAfter,
      },
    ],
  };
}
