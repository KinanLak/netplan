import { getWallBlockKey } from "./keys";
import {
  buildSnapPath,
  createOrthogonalLineDraft,
  createRoomWallDrafts,
  resolveEraseCandidate,
  splitWallDraftIntoBlocks,
  splitWallDraftsIntoBlocks,
} from "./selectors";
import type { WallCommandReason, WallDraft, WallSegment } from "@/types/map";
import type {
  AddLineCommandInput,
  AddRoomCommandInput,
  EngineResult,
  EraseAtPointerCommandInput,
  EraseStrokeCommandInput,
} from "./types";

const defaultGenerateWallId = () =>
  `wall-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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
  generateWallId: () => string,
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
    ...Array.from(stagedByKey.values()).map((block) => ({
      ...block,
      id: generateWallId(),
    })),
  ];

  return changedResult(nextWalls, [...stagedByKey.keys()]);
};

export const addLine = (input: AddLineCommandInput): EngineResult => {
  const line = createOrthogonalLineDraft(
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
    input.generateWallId ?? defaultGenerateWallId,
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
    input.generateWallId ?? defaultGenerateWallId,
    "invalid-room",
  );
};

const eraseAtPointerCore = (
  input: EraseAtPointerCommandInput,
  previewOnly: boolean,
): EngineResult => {
  const candidate = resolveEraseCandidate(
    input.walls,
    input.floorId,
    input.pointer,
    input.snappedPoint,
  );

  if (!candidate) {
    return unchangedResult(
      input.walls,
      previewOnly ? "preview-miss" : "no-wall-at-pointer",
    );
  }

  if (previewOnly) {
    return unchangedResult(input.walls, "preview-hit", [candidate.key]);
  }

  const nextWalls = input.walls.filter(
    (wall) => getWallBlockKey(wall) !== candidate.key,
  );

  if (nextWalls.length === input.walls.length) {
    return unchangedResult(input.walls, "no-wall-at-pointer");
  }

  return changedResult(nextWalls, [candidate.key]);
};

export const previewEraseAtPointer = (
  input: EraseAtPointerCommandInput,
): EngineResult => eraseAtPointerCore(input, true);

export const eraseAtPointer = (
  input: EraseAtPointerCommandInput,
): EngineResult => eraseAtPointerCore(input, false);

export const eraseStroke = (input: EraseStrokeCommandInput): EngineResult => {
  const snapPath = buildSnapPath(input.fromSnappedPoint, input.toSnappedPoint);
  if (snapPath.length === 0) {
    return unchangedResult(input.walls, "empty-stroke");
  }

  let currentWalls = asMutableWalls(input.walls);
  const affectedKeys = new Set<string>();

  const maxStep = Math.max(snapPath.length - 1, 1);

  snapPath.forEach((snappedPoint, index) => {
    const t = snapPath.length === 1 ? 1 : index / maxStep;
    const pointer = {
      x: input.fromPointer.x + (input.toPointer.x - input.fromPointer.x) * t,
      y: input.fromPointer.y + (input.toPointer.y - input.fromPointer.y) * t,
    };

    const stepResult = eraseAtPointerCore(
      {
        walls: currentWalls,
        floorId: input.floorId,
        pointer,
        snappedPoint,
      },
      false,
    );

    if (!stepResult.changed) {
      return;
    }

    currentWalls = stepResult.nextWalls;

    stepResult.affectedKeys.forEach((key) => {
      affectedKeys.add(key);
    });
  });

  if (affectedKeys.size === 0) {
    return unchangedResult(input.walls, "no-wall-at-pointer");
  }

  return changedResult(currentWalls, [...affectedKeys]);
};
