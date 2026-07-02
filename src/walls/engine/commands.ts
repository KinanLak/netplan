import {
  getWallBlockKey,
  getWallGeometryKey,
} from "@/walls/gridGeometry/cells";
import {
  createOrthogonalWallDraft,
  createRoomWallDrafts,
  splitWallDraftIntoBlocks,
  splitWallDraftsIntoBlocks,
} from "@/walls/gridGeometry/drafts";
import {
  buildWallEraseIndex,
  buildWallSnapPath,
  resolveWallEraseCandidatesFromIndex,
} from "@/walls/gridGeometry/erase";
import type {
  WallCommandReason,
  WallDraft,
  WallId,
  WallSegment,
} from "@/types/map";
import type {
  AddLineCommandInput,
  AddRoomCommandInput,
  EngineResult,
  EraseAtPointerCommandInput,
  EraseStrokeCommandInput,
} from "./types";

const asMutableWalls = (
  walls: ReadonlyArray<WallSegment>,
): Array<WallSegment> => walls as Array<WallSegment>;

const unchangedResult = (
  walls: ReadonlyArray<WallSegment>,
  reason: WallCommandReason,
  affectedKeys: Array<string> = [],
): EngineResult => ({
  changed: false,
  nextWalls: asMutableWalls(walls),
  affectedKeys,
  reason,
});

const changedResult = (
  nextWalls: Array<WallSegment>,
  affectedKeys: Array<string>,
): EngineResult => ({
  changed: true,
  nextWalls,
  affectedKeys,
  reason: "applied",
});

const addBlocks = (
  walls: ReadonlyArray<WallSegment>,
  blocks: Array<WallDraft>,
  collidesWithBlock: AddLineCommandInput["collidesWithBlock"],
  generateWallId: () => WallId,
  invalidReason: WallCommandReason,
): EngineResult => {
  if (blocks.length === 0) {
    return unchangedResult(walls, invalidReason);
  }

  const existingKeys = new Set(
    walls
      .map((wall) => getWallBlockKey(wall))
      .filter((key): key is string => key !== null),
  );

  const stagedByKey = new Map<string, WallDraft>();

  for (const block of blocks) {
    const key = getWallBlockKey(block);
    if (!key || existingKeys.has(key) || stagedByKey.has(key)) {
      continue;
    }

    if (collidesWithBlock?.(block)) {
      return unchangedResult(walls, "collision-with-device");
    }

    stagedByKey.set(key, block);
  }

  if (stagedByKey.size === 0) {
    return unchangedResult(walls, "already-exists");
  }

  const nextWalls = [
    ...walls,
    ...Array.from(stagedByKey.values()).map(
      (block): WallSegment => ({
        ...block,
        id: generateWallId(),
        geometryKey: getWallGeometryKey(block) ?? "",
      }),
    ),
  ];

  return changedResult(nextWalls, [...stagedByKey.keys()]);
};

export const addLine = (input: AddLineCommandInput): EngineResult => {
  const line = createOrthogonalWallDraft(
    input.start,
    input.end,
    input.floorId,
    input.color,
  );

  if (!line) {
    return unchangedResult(input.walls, "invalid-line");
  }

  const blocks = splitWallDraftIntoBlocks(line);

  return addBlocks(
    input.walls,
    blocks,
    input.collidesWithBlock,
    input.generateWallId,
    "invalid-line",
  );
};

export const addRoom = (input: AddRoomCommandInput): EngineResult => {
  const roomLines = createRoomWallDrafts(
    input.start,
    input.end,
    input.floorId,
    input.color,
  );

  if (roomLines.length === 0) {
    return unchangedResult(input.walls, "invalid-room");
  }

  const blocks = splitWallDraftsIntoBlocks(roomLines);

  return addBlocks(
    input.walls,
    blocks,
    input.collidesWithBlock,
    input.generateWallId,
    "invalid-room",
  );
};

const eraseAtPointerCore = (
  input: EraseAtPointerCommandInput,
  previewOnly: boolean,
): EngineResult => {
  const eraseIndex =
    input.eraseIndex ?? buildWallEraseIndex(input.walls, input.floorId);
  const candidates = resolveWallEraseCandidatesFromIndex(
    eraseIndex,
    input.pointer,
    input.eraserSize,
  );

  if (candidates.length === 0) {
    return unchangedResult(
      input.walls,
      previewOnly ? "preview-miss" : "no-wall-at-pointer",
    );
  }

  const affectedKeys = candidates.map((candidate) => candidate.key);

  if (previewOnly) {
    return unchangedResult(input.walls, "preview-hit", affectedKeys);
  }

  const affectedKeySet = new Set(affectedKeys);

  const nextWalls = input.walls.filter(
    (wall) => !affectedKeySet.has(getWallBlockKey(wall) ?? ""),
  );

  if (nextWalls.length === input.walls.length) {
    return unchangedResult(input.walls, "no-wall-at-pointer");
  }

  return changedResult(nextWalls, affectedKeys);
};

export const previewEraseAtPointer = (
  input: EraseAtPointerCommandInput,
): EngineResult => eraseAtPointerCore(input, true);

export const eraseAtPointer = (
  input: EraseAtPointerCommandInput,
): EngineResult => eraseAtPointerCore(input, false);

export const eraseStroke = (input: EraseStrokeCommandInput): EngineResult => {
  const snapPath = buildWallSnapPath(
    input.fromSnappedPoint,
    input.toSnappedPoint,
  );
  if (snapPath.length === 0) {
    return unchangedResult(input.walls, "empty-stroke");
  }

  // One cell index for the whole stroke: every path step is then an O(cells
  // under the eraser) lookup, and the walls array is filtered exactly once.
  const eraseIndex =
    input.eraseIndex ?? buildWallEraseIndex(input.walls, input.floorId);
  const affectedKeys = new Set<string>();

  const maxStep = Math.max(snapPath.length - 1, 1);

  snapPath.forEach((_snappedPoint, index) => {
    const t = snapPath.length === 1 ? 1 : index / maxStep;
    const pointer = {
      x: input.fromPointer.x + (input.toPointer.x - input.fromPointer.x) * t,
      y: input.fromPointer.y + (input.toPointer.y - input.fromPointer.y) * t,
    };

    const candidates = resolveWallEraseCandidatesFromIndex(
      eraseIndex,
      pointer,
      input.eraserSize,
      affectedKeys,
    );

    for (const candidate of candidates) {
      affectedKeys.add(candidate.key);
    }
  });

  if (affectedKeys.size === 0) {
    return unchangedResult(input.walls, "no-wall-at-pointer");
  }

  const nextWalls = input.walls.filter(
    (wall) => !affectedKeys.has(getWallBlockKey(wall) ?? ""),
  );

  return changedResult(nextWalls, [...affectedKeys]);
};
