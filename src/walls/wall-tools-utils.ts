import { useCallback, useState } from "react";
import type {
  DrawTool,
  Position,
  WallColor,
  WallCommandReason,
  WallDraft,
} from "@/types/map";
import { arePositionsEqual } from "@/lib/walls";

import {
  createOrthogonalLineDraft,
  createRoomWallDrafts,
  splitWallDraftIntoBlocks,
  splitWallDraftsIntoBlocks,
} from "@/walls/engine";

export interface PointerSample {
  pointer: Position;
  snappedPoint: Position;
}

export const areNullablePositionsEqual = (
  a: Position | null,
  b: Position | null,
): boolean => {
  if (!a || !b) {
    return a === b;
  }

  return arePositionsEqual(a, b);
};

export const areStringArraysEqual = (
  current: Array<string>,
  next: Array<string>,
): boolean => {
  if (current === next) {
    return true;
  }

  if (current.length !== next.length) {
    return false;
  }

  for (let index = 0; index < current.length; index += 1) {
    if (current[index] !== next[index]) {
      return false;
    }
  }

  return true;
};

/** Create a stable setter that skips updates when the position hasn't changed. */
export const usePositionSetter = () => {
  const [value, setValue] = useState<Position | null>(null);

  const setIfChanged = useCallback((next: Position | null) => {
    setValue((previous) =>
      areNullablePositionsEqual(previous, next) ? previous : next,
    );
  }, []);

  return [value, setIfChanged] as const;
};

export const toLineFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-line":
      return "Segment de mur invalide.";
    case "collision-with-device":
      return "Mur refuse: collision avec un device.";
    case "already-exists":
      return "Aucun nouveau bloc de mur a ajouter.";
    default:
      return "Impossible d'ajouter ce mur.";
  }
};

export const toRoomFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-room":
      return "Salle refusée: rectangle vide.";
    case "collision-with-device":
      return "Salle refusée: collision avec un device.";
    case "already-exists":
      return "Aucun nouveau bloc de mur à ajouter.";
    default:
      return "Impossible d'ajouter cette salle.";
  }
};

export const computePreviewSegments = (
  drawAnchor: Position | null,
  pointerPreview: Position | null,
  currentFloorId: string | null,
  activeDrawTool: DrawTool,
  selectedWallColor: WallColor,
): Array<WallDraft> => {
  if (
    !drawAnchor ||
    !pointerPreview ||
    !currentFloorId ||
    activeDrawTool === "device" ||
    activeDrawTool === "wall-brush" ||
    activeDrawTool === "wall-erase"
  ) {
    return [];
  }

  if (activeDrawTool === "wall") {
    const segment = createOrthogonalLineDraft(
      drawAnchor,
      pointerPreview,
      currentFloorId,
      selectedWallColor,
    );

    return segment ? splitWallDraftIntoBlocks(segment) : [];
  }

  const roomDrafts = createRoomWallDrafts(
    drawAnchor,
    pointerPreview,
    currentFloorId,
    selectedWallColor,
  );

  return splitWallDraftsIntoBlocks(roomDrafts);
};

export const computePaneCursorClass = (
  isEditMode: boolean,
  activeDrawTool: DrawTool,
  drawAnchor: Position | null,
  pointerPreview: Position | null,
): string => {
  if (!isEditMode || activeDrawTool === "device") {
    return "canvas-cursor-default";
  }

  if (
    activeDrawTool === "room" ||
    activeDrawTool === "wall-brush" ||
    activeDrawTool === "wall-erase"
  ) {
    return "wall-cursor-crosshair";
  }

  if (!drawAnchor || !pointerPreview) {
    return "wall-cursor-crosshair";
  }

  if (arePositionsEqual(pointerPreview, drawAnchor)) {
    return "wall-cursor-crosshair";
  }

  const dx = pointerPreview.x - drawAnchor.x;
  const dy = pointerPreview.y - drawAnchor.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "wall-cursor-e" : "wall-cursor-w";
  }

  return dy >= 0 ? "wall-cursor-s" : "wall-cursor-n";
};
