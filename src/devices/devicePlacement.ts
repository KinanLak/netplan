import { CANVAS_DEVICE_NEAREST_POSITION_MAX_RADIUS } from "@/lib/constants";
import { GRID_SIZE } from "@/lib/grid";
import type { DeviceId, FloorId, Position, Size } from "@/types/map";

type PlacementStatus = "exact" | "relocated" | "reused-last-valid";

type DragSession = {
  lastGridCell: string;
  lastValidPosition: Position;
};

type PlacementResolution = {
  position: Position;
  status: Exclude<PlacementStatus, "reused-last-valid">;
};

export type DevicePlacementRequest =
  | {
      kind: "add";
      floorId: FloorId;
      requestedPosition: Position;
      size: Size;
    }
  | {
      kind: "drag";
      deviceId: DeviceId;
      floorId: FloorId;
      requestedPosition: Position;
      size: Size;
      startPosition: Position;
    };

export type DevicePlacementResult =
  | {
      ok: true;
      position: Position;
      status: PlacementStatus;
    }
  | {
      ok: false;
      reason: "no-valid-position";
    };

export interface DevicePlacement {
  resolve: (request: DevicePlacementRequest) => DevicePlacementResult;
  commitDrag: (deviceId: DeviceId) => Position | null;
}

interface CreateDevicePlacementOptions {
  checkCollision: (
    floorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
  ) => boolean;
  gridSize?: number;
  maxSearchRadius?: number;
}

const snapPosition = (position: Position, gridSize: number): Position => ({
  x: Math.round(position.x / gridSize) * gridSize,
  y: Math.round(position.y / gridSize) * gridSize,
});

const toGridCell = (position: Position, gridSize: number): string => {
  return `${Math.floor(position.x / gridSize)},${Math.floor(position.y / gridSize)}`;
};

const dedupePositions = (positions: Array<Position>): Array<Position> => {
  return Array.from(
    new Map(
      positions.map((position) => [`${position.x},${position.y}`, position]),
    ).values(),
  );
};

const resolvePosition = (
  options: CreateDevicePlacementOptions,
  floorId: FloorId,
  deviceId: DeviceId,
  requestedPosition: Position,
  size: Size,
): PlacementResolution | null => {
  const gridSize = options.gridSize ?? GRID_SIZE;
  const maxSearchRadius =
    options.maxSearchRadius ?? CANVAS_DEVICE_NEAREST_POSITION_MAX_RADIUS;
  const snappedRequestedPosition = snapPosition(requestedPosition, gridSize);

  if (
    !options.checkCollision(floorId, deviceId, snappedRequestedPosition, size)
  ) {
    return {
      position: snappedRequestedPosition,
      status: "exact",
    };
  }

  for (let radius = gridSize; radius <= maxSearchRadius; radius += gridSize) {
    const ringPositions: Array<Position> = [];

    for (let dx = -radius; dx <= radius; dx += gridSize) {
      for (let dy = -radius; dy <= radius; dy += gridSize) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance >= radius - gridSize && distance < radius + gridSize) {
          ringPositions.push(
            snapPosition(
              {
                x: snappedRequestedPosition.x + dx,
                y: snappedRequestedPosition.y + dy,
              },
              gridSize,
            ),
          );
        }
      }
    }

    const sortedRingPositions = dedupePositions(ringPositions).toSorted(
      (a, b) => {
        const distanceA =
          Math.abs(a.x - snappedRequestedPosition.x) +
          Math.abs(a.y - snappedRequestedPosition.y);
        const distanceB =
          Math.abs(b.x - snappedRequestedPosition.x) +
          Math.abs(b.y - snappedRequestedPosition.y);
        return distanceA - distanceB;
      },
    );

    for (const candidatePosition of sortedRingPositions) {
      if (!options.checkCollision(floorId, deviceId, candidatePosition, size)) {
        return {
          position: candidatePosition,
          status: "relocated",
        };
      }
    }
  }

  return null;
};

export const createDevicePlacement = (
  options: CreateDevicePlacementOptions,
): DevicePlacement => {
  const dragSessions = new Map<DeviceId, DragSession>();
  const gridSize = options.gridSize ?? GRID_SIZE;

  return {
    resolve: (request) => {
      if (request.kind === "add") {
        const resolvedPosition = resolvePosition(
          options,
          request.floorId,
          "" as DeviceId,
          request.requestedPosition,
          request.size,
        );

        if (!resolvedPosition) {
          return {
            ok: false,
            reason: "no-valid-position",
          };
        }

        return {
          ok: true,
          position: resolvedPosition.position,
          status: resolvedPosition.status,
        };
      }

      const existingSession = dragSessions.get(request.deviceId);
      const nextSession = existingSession ?? {
        lastGridCell: toGridCell(request.startPosition, gridSize),
        lastValidPosition: snapPosition(request.startPosition, gridSize),
      };
      dragSessions.set(request.deviceId, nextSession);

      const snappedRequestedPosition = snapPosition(
        request.requestedPosition,
        gridSize,
      );
      const requestedGridCell = toGridCell(snappedRequestedPosition, gridSize);

      if (requestedGridCell === nextSession.lastGridCell) {
        return {
          ok: true,
          position: nextSession.lastValidPosition,
          status: "reused-last-valid",
        };
      }

      nextSession.lastGridCell = requestedGridCell;

      const resolvedPosition = resolvePosition(
        options,
        request.floorId,
        request.deviceId,
        snappedRequestedPosition,
        request.size,
      );

      if (!resolvedPosition) {
        return {
          ok: true,
          position: nextSession.lastValidPosition,
          status: "reused-last-valid",
        };
      }

      nextSession.lastValidPosition = resolvedPosition.position;

      return {
        ok: true,
        position: resolvedPosition.position,
        status: resolvedPosition.status,
      };
    },
    commitDrag: (deviceId) => {
      const session = dragSessions.get(deviceId);
      dragSessions.delete(deviceId);
      return session?.lastValidPosition ?? null;
    },
  };
};
