import type { MapDocument } from "@/types/map";
import type {
  AddWallLineInput,
  AddWallRoomInput,
  EraseWallAtPointerInput,
  EraseWallStrokeInput,
  MapCommandResult,
  WallCommandFailureReason,
} from "@/domain/map/types";
import { wallCollidesWithDevices } from "@/lib/geometry";
import { addLine, addRoom, eraseAtPointer, eraseStroke } from "@/walls/engine";
import { getDevicesForFloor } from "@/domain/map/selectors";

const asWallFailureReason = (reason: string): WallCommandFailureReason =>
  reason as WallCommandFailureReason;

const floorExists = (document: MapDocument, floorId: string) =>
  document.buildings.some((building) =>
    building.floors.some((floor) => floor.id === floorId),
  );

export const addWallLine = (
  document: MapDocument,
  { wall, generateWallId }: AddWallLineInput,
): MapCommandResult<WallCommandFailureReason> => {
  if (!floorExists(document, wall.floorId)) {
    return { ok: false, document, reason: "floor-not-found" };
  }

  const result = addLine({
    walls: document.walls,
    floorId: wall.floorId,
    color: wall.color,
    start: wall.start,
    end: wall.end,
    generateWallId,
    collidesWithBlock: (block) =>
      wallCollidesWithDevices(
        block,
        getDevicesForFloor(document, wall.floorId),
      ),
  });

  if (!result.changed) {
    return { ok: false, document, reason: asWallFailureReason(result.reason) };
  }

  return {
    ok: true,
    document: {
      ...document,
      walls: result.nextWalls,
    },
    affectedIds: result.affectedKeys,
    reason: "applied",
  };
};

export const addWallRoom = (
  document: MapDocument,
  { room, generateWallId }: AddWallRoomInput,
): MapCommandResult<WallCommandFailureReason> => {
  if (!floorExists(document, room.floorId)) {
    return { ok: false, document, reason: "floor-not-found" };
  }

  const result = addRoom({
    walls: document.walls,
    floorId: room.floorId,
    color: room.color,
    start: room.start,
    end: room.end,
    generateWallId,
    collidesWithBlock: (block) =>
      wallCollidesWithDevices(
        block,
        getDevicesForFloor(document, room.floorId),
      ),
  });

  if (!result.changed) {
    return { ok: false, document, reason: asWallFailureReason(result.reason) };
  }

  return {
    ok: true,
    document: {
      ...document,
      walls: result.nextWalls,
    },
    affectedIds: result.affectedKeys,
    reason: "applied",
  };
};

export const eraseWallAtPointer = (
  document: MapDocument,
  { input }: EraseWallAtPointerInput,
): MapCommandResult<WallCommandFailureReason> => {
  if (!floorExists(document, input.floorId)) {
    return { ok: false, document, reason: "floor-not-found" };
  }

  const result = eraseAtPointer({
    walls: document.walls,
    floorId: input.floorId,
    pointer: input.pointer,
    snappedPoint: input.snappedPoint,
  });

  if (!result.changed) {
    return { ok: false, document, reason: asWallFailureReason(result.reason) };
  }

  return {
    ok: true,
    document: {
      ...document,
      walls: result.nextWalls,
    },
    affectedIds: result.affectedKeys,
    reason: "applied",
  };
};

export const eraseWallStroke = (
  document: MapDocument,
  { input }: EraseWallStrokeInput,
): MapCommandResult<WallCommandFailureReason> => {
  if (!floorExists(document, input.floorId)) {
    return { ok: false, document, reason: "floor-not-found" };
  }

  const result = eraseStroke({
    walls: document.walls,
    floorId: input.floorId,
    fromPointer: input.fromPointer,
    fromSnappedPoint: input.fromSnappedPoint,
    toPointer: input.toPointer,
    toSnappedPoint: input.toSnappedPoint,
  });

  if (!result.changed) {
    return { ok: false, document, reason: asWallFailureReason(result.reason) };
  }

  return {
    ok: true,
    document: {
      ...document,
      walls: result.nextWalls,
    },
    affectedIds: result.affectedKeys,
    reason: "applied",
  };
};
