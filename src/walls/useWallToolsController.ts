import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type {
  Position,
  WallCommandReason,
  WallDraft,
  WallPointerInput,
  WallStrokeInput,
} from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { arePositionsEqual, snapPositionToWallGrid } from "@/lib/walls";
import {
  createOrthogonalLineDraft,
  createRoomWallDrafts,
  splitWallDraftIntoBlocks,
  splitWallDraftsIntoBlocks,
} from "@/walls/engine";

interface PointerSample {
  pointer: Position;
  snappedPoint: Position;
}

const toLineFailureMessage = (reason: WallCommandReason): string => {
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

const toRoomFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-room":
      return "Salle refusee: rectangle vide.";
    case "collision-with-device":
      return "Salle refusee: collision avec un device.";
    case "already-exists":
      return "Aucun nouveau bloc de mur a ajouter.";
    default:
      return "Impossible d'ajouter cette salle.";
  }
};

export interface WallToolsController {
  drawAnchor: Position | null;
  hoverSnapPoint: Position | null;
  pointerPosition: Position | null;
  pointerSnapPoint: Position | null;
  lastWallStartPoint: Position | null;
  drawMessage: string | null;
  previewSegments: Array<WallDraft>;
  erasePreviewKeys: Array<string>;
  paneCursorClass: string;
  cancelTool: () => void;
  handlePaneMouseMove: (event: React.MouseEvent) => void;
  handlePaneClick: (event: React.MouseEvent) => boolean;
  handleContextMenu: (event: React.MouseEvent | MouseEvent) => boolean;
}

export const useWallToolsController = (): WallToolsController => {
  const reactFlow = useReactFlow();

  const isEditMode = useMapStore((state) => state.isEditMode);
  const activeDrawTool = useMapStore((state) => state.activeDrawTool);
  const currentFloorId = useMapStore((state) => state.currentFloorId);
  const selectedWallColor = useMapStore((state) => state.selectedWallColor);

  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const addWallLine = useMapStore((state) => state.addWallLine);
  const addWallRoom = useMapStore((state) => state.addWallRoom);
  const eraseWallAtPointer = useMapStore((state) => state.eraseWallAtPointer);
  const eraseWallStroke = useMapStore((state) => state.eraseWallStroke);
  const previewEraseWallAtPointer = useMapStore(
    (state) => state.previewEraseWallAtPointer,
  );

  const [drawAnchor, setDrawAnchor] = useState<Position | null>(null);
  const [pointerPreview, setPointerPreview] = useState<Position | null>(null);
  const [hoverSnapPoint, setHoverSnapPoint] = useState<Position | null>(null);
  const [pointerPosition, setPointerPosition] = useState<Position | null>(null);
  const [pointerSnapPoint, setPointerSnapPoint] = useState<Position | null>(
    null,
  );
  const [lastWallStartPoint, setLastWallStartPoint] = useState<Position | null>(
    null,
  );
  const [drawMessage, setDrawMessage] = useState<string | null>(null);
  const [erasePreviewKeys, setErasePreviewKeys] = useState<Array<string>>([]);

  const eraseStrokeLastSample = useRef<PointerSample | null>(null);
  const isEraseStrokeActive = useRef(false);
  const ignoreNextEraseClick = useRef(false);
  const brushStrokeLastSample = useRef<PointerSample | null>(null);
  const isBrushStrokeActive = useRef(false);
  const ignoreNextBrushClick = useRef(false);

  const clearEraseStrokeState = useCallback(() => {
    eraseStrokeLastSample.current = null;
    isEraseStrokeActive.current = false;
  }, []);

  const clearBrushStrokeState = useCallback(() => {
    brushStrokeLastSample.current = null;
    isBrushStrokeActive.current = false;
  }, []);

  const clearDrawState = useCallback(() => {
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setPointerPosition(null);
    setPointerSnapPoint(null);
    setLastWallStartPoint(null);
    setDrawMessage(null);
    setErasePreviewKeys([]);
    clearEraseStrokeState();
    clearBrushStrokeState();
    ignoreNextEraseClick.current = false;
    ignoreNextBrushClick.current = false;
  }, [clearBrushStrokeState, clearEraseStrokeState]);

  const getPointerSample = useCallback(
    (event: React.MouseEvent): PointerSample => {
      const pointer = reactFlow.screenToFlowPosition(
        { x: event.clientX, y: event.clientY },
        { snapToGrid: false },
      );

      return {
        pointer,
        snappedPoint: snapPositionToWallGrid(pointer),
      };
    },
    [reactFlow],
  );

  const previewSegments = useMemo(() => {
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
  }, [
    activeDrawTool,
    currentFloorId,
    drawAnchor,
    pointerPreview,
    selectedWallColor,
  ]);

  const drawContextKey = `${activeDrawTool}:${currentFloorId}:${isEditMode}`;
  const [previousDrawContextKey, setPreviousDrawContextKey] =
    useState(drawContextKey);

  if (previousDrawContextKey !== drawContextKey) {
    setPreviousDrawContextKey(drawContextKey);
    setDrawAnchor(null);
    setPointerPreview(null);
    setHoverSnapPoint(null);
    setPointerPosition(null);
    setPointerSnapPoint(null);
    setLastWallStartPoint(null);
    setDrawMessage(null);
    setErasePreviewKeys([]);
  }

  useEffect(() => {
    clearEraseStrokeState();
    clearBrushStrokeState();
    ignoreNextEraseClick.current = false;
    ignoreNextBrushClick.current = false;
  }, [clearBrushStrokeState, clearEraseStrokeState, drawContextKey]);

  useEffect(() => {
    const handlePointerRelease = () => {
      if (activeDrawTool !== "wall-erase" && activeDrawTool !== "wall-brush") {
        return;
      }

      clearEraseStrokeState();
      clearBrushStrokeState();
    };

    window.addEventListener("mouseup", handlePointerRelease);
    window.addEventListener("blur", handlePointerRelease);

    return () => {
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("blur", handlePointerRelease);
    };
  }, [activeDrawTool, clearBrushStrokeState, clearEraseStrokeState]);

  const cancelTool = useCallback(() => {
    setActiveDrawTool("device");
    clearDrawState();
  }, [clearDrawState, setActiveDrawTool]);

  const applyErasePreview = useCallback(
    (input: WallPointerInput) => {
      const preview = previewEraseWallAtPointer(input);
      setErasePreviewKeys(preview.affectedKeys);
    },
    [previewEraseWallAtPointer],
  );

  const applyBrushAtPoint = useCallback(
    (floorId: string, snappedPoint: Position) => {
      return addWallLine({
        floorId,
        start: snappedPoint,
        end: { x: snappedPoint.x + 1, y: snappedPoint.y },
        color: selectedWallColor,
      });
    },
    [addWallLine, selectedWallColor],
  );

  const handlePaneMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!isEditMode || activeDrawTool === "device" || !currentFloorId) {
        return;
      }

      const sample = getPointerSample(event);
      setPointerPosition(sample.pointer);
      setPointerSnapPoint(sample.snappedPoint);

      if (activeDrawTool === "wall-erase") {
        setHoverSnapPoint(sample.snappedPoint);
        setPointerPreview(null);

        applyErasePreview({
          floorId: currentFloorId,
          pointer: sample.pointer,
          snappedPoint: sample.snappedPoint,
        });

        const isPrimaryButtonPressed = (event.buttons & 1) === 1;
        if (!isPrimaryButtonPressed) {
          clearEraseStrokeState();
          return;
        }

        if (!isEraseStrokeActive.current) {
          isEraseStrokeActive.current = true;
          eraseStrokeLastSample.current = sample;
          return;
        }

        const previous = eraseStrokeLastSample.current;
        if (!previous) {
          eraseStrokeLastSample.current = sample;
          return;
        }

        const strokeInput: WallStrokeInput = {
          floorId: currentFloorId,
          fromPointer: previous.pointer,
          fromSnappedPoint: previous.snappedPoint,
          toPointer: sample.pointer,
          toSnappedPoint: sample.snappedPoint,
        };

        const strokeResult = eraseWallStroke(strokeInput);
        if (strokeResult.changed) {
          setDrawMessage(null);
        }

        ignoreNextEraseClick.current = true;
        eraseStrokeLastSample.current = sample;
        return;
      }

      if (activeDrawTool === "wall-brush") {
        setHoverSnapPoint(sample.snappedPoint);
        setPointerPreview(null);
        setErasePreviewKeys((prev) => (prev.length === 0 ? prev : []));

        const isPrimaryButtonPressed = (event.buttons & 1) === 1;
        if (!isPrimaryButtonPressed) {
          clearBrushStrokeState();
          return;
        }

        if (!isBrushStrokeActive.current) {
          isBrushStrokeActive.current = true;
          brushStrokeLastSample.current = sample;
          applyBrushAtPoint(currentFloorId, sample.snappedPoint);
          ignoreNextBrushClick.current = true;
          return;
        }

        const previous = brushStrokeLastSample.current;
        if (!previous) {
          brushStrokeLastSample.current = sample;
          applyBrushAtPoint(currentFloorId, sample.snappedPoint);
          ignoreNextBrushClick.current = true;
          return;
        }

        const strokeResult = addWallLine({
          floorId: currentFloorId,
          start: previous.snappedPoint,
          end: sample.snappedPoint,
          color: selectedWallColor,
        });

        if (strokeResult.changed) {
          setDrawMessage(null);
        }

        ignoreNextBrushClick.current = true;
        brushStrokeLastSample.current = sample;
        return;
      }

      setErasePreviewKeys((prev) => (prev.length === 0 ? prev : []));

      if (drawAnchor) {
        setPointerPreview(sample.snappedPoint);
      } else {
        setPointerPreview(null);
      }

      if (activeDrawTool === "wall" && !drawAnchor) {
        setHoverSnapPoint(sample.snappedPoint);
        return;
      }

      setHoverSnapPoint(null);
    },
    [
      activeDrawTool,
      applyBrushAtPoint,
      applyErasePreview,
      clearBrushStrokeState,
      clearEraseStrokeState,
      currentFloorId,
      drawAnchor,
      addWallLine,
      eraseWallStroke,
      getPointerSample,
      isEditMode,
      selectedWallColor,
    ],
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent): boolean => {
      if (!currentFloorId || !isEditMode || activeDrawTool === "device") {
        return false;
      }

      const sample = getPointerSample(event);

      if (activeDrawTool === "wall-erase") {
        if (ignoreNextEraseClick.current) {
          ignoreNextEraseClick.current = false;
          return true;
        }

        const eraseResult = eraseWallAtPointer({
          floorId: currentFloorId,
          pointer: sample.pointer,
          snappedPoint: sample.snappedPoint,
        });

        if (!eraseResult.changed) {
          setDrawMessage("Aucun bloc de mur a supprimer.");
        } else {
          setDrawMessage(null);
        }

        setHoverSnapPoint(sample.snappedPoint);
        setPointerPreview(null);
        applyErasePreview({
          floorId: currentFloorId,
          pointer: sample.pointer,
          snappedPoint: sample.snappedPoint,
        });

        return true;
      }

      if (activeDrawTool === "wall-brush") {
        if (ignoreNextBrushClick.current) {
          ignoreNextBrushClick.current = false;
          return true;
        }

        const brushResult = applyBrushAtPoint(
          currentFloorId,
          sample.snappedPoint,
        );

        if (brushResult.reason === "collision-with-device") {
          setDrawMessage("Mur refuse: collision avec un device.");
        } else if (brushResult.changed) {
          setDrawMessage(null);
        }

        setHoverSnapPoint(sample.snappedPoint);
        setPointerPreview(null);
        return true;
      }

      const drawPoint =
        activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint
          ? hoverSnapPoint
          : sample.snappedPoint;

      setPointerPreview(drawPoint);

      if (!drawAnchor) {
        setDrawAnchor(drawPoint);
        if (activeDrawTool === "wall") {
          setLastWallStartPoint(drawPoint);
        }
        setDrawMessage(null);
        return true;
      }

      if (arePositionsEqual(drawPoint, drawAnchor)) {
        setDrawAnchor(null);
        setPointerPreview(null);
        setDrawMessage(null);
        return true;
      }

      if (activeDrawTool === "wall") {
        const result = addWallLine({
          floorId: currentFloorId,
          start: drawAnchor,
          end: drawPoint,
          color: selectedWallColor,
        });

        if (!result.changed) {
          setDrawMessage(toLineFailureMessage(result.reason));
          return true;
        }

        setDrawAnchor(null);
        setLastWallStartPoint(null);
        setPointerPreview(null);
        setHoverSnapPoint(null);
        setDrawMessage(null);
        return true;
      }

      const roomResult = addWallRoom({
        floorId: currentFloorId,
        start: drawAnchor,
        end: drawPoint,
        color: selectedWallColor,
      });

      if (!roomResult.changed) {
        setDrawMessage(toRoomFailureMessage(roomResult.reason));
        return true;
      }

      setDrawAnchor(null);
      setLastWallStartPoint(null);
      setPointerPreview(null);
      setHoverSnapPoint(null);
      setDrawMessage(null);
      return true;
    },
    [
      activeDrawTool,
      addWallLine,
      addWallRoom,
      applyBrushAtPoint,
      applyErasePreview,
      currentFloorId,
      drawAnchor,
      eraseWallAtPointer,
      getPointerSample,
      hoverSnapPoint,
      isEditMode,
      selectedWallColor,
    ],
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent): boolean => {
      if (!isEditMode || activeDrawTool === "device") {
        return false;
      }

      event.preventDefault();
      cancelTool();
      return true;
    },
    [activeDrawTool, cancelTool, isEditMode],
  );

  const paneCursorClass = useMemo(() => {
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
  }, [activeDrawTool, drawAnchor, isEditMode, pointerPreview]);

  return {
    drawAnchor,
    hoverSnapPoint,
    pointerPosition,
    pointerSnapPoint,
    lastWallStartPoint,
    drawMessage,
    previewSegments,
    erasePreviewKeys,
    paneCursorClass,
    cancelTool,
    handlePaneMouseMove,
    handlePaneClick,
    handleContextMenu,
  };
};
