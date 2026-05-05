import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import type {
  Position,
  WallDraft,
  WallPointerInput,
  WallStrokeInput,
} from "@/types/map";
import type { PointerSample } from "@/walls/wall-tools-utils";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedWallColor,
} from "@/store/selectors";
import { arePositionsEqual, snapPositionToWallGrid } from "@/lib/walls";
import {
  areStringArraysEqual,
  computePaneCursorClass,
  computePreviewSegments,
  toLineFailureMessage,
  toRoomFailureMessage,
  usePositionSetter,
} from "@/walls/wall-tools-utils";

interface UseWallToolsControllerOptions {
  trackPointerPosition?: boolean;
}

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

export const useWallToolsController = (
  options: UseWallToolsControllerOptions = {},
): WallToolsController => {
  const { trackPointerPosition = false } = options;
  const reactFlow = useReactFlow();

  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const currentFloorId = useCurrentFloorId();
  const selectedWallColor = useSelectedWallColor();

  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const addWallLine = useMapStore((state) => state.addWallLine);
  const addWallRoom = useMapStore((state) => state.addWallRoom);
  const eraseWallAtPointer = useMapStore((state) => state.eraseWallAtPointer);
  const eraseWallStroke = useMapStore((state) => state.eraseWallStroke);
  const previewEraseWallAtPointer = useMapStore(
    (state) => state.previewEraseWallAtPointer,
  );

  const [drawAnchor, setDrawAnchor] = useState<Position | null>(null);
  const [pointerPreview, setPointerPreviewIfChanged] = usePositionSetter();
  const [hoverSnapPoint, setHoverSnapPointIfChanged] = usePositionSetter();
  const [pointerPosition, setPointerPositionIfChanged] = usePositionSetter();
  const [pointerSnapPoint, setPointerSnapPointIfChanged] = usePositionSetter();
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

  const setErasePreviewKeysIfChanged = useCallback((next: Array<string>) => {
    setErasePreviewKeys((previous) =>
      areStringArraysEqual(previous, next) ? previous : next,
    );
  }, []);

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
    setPointerPreviewIfChanged(null);
    setHoverSnapPointIfChanged(null);
    setPointerPositionIfChanged(null);
    setPointerSnapPointIfChanged(null);
    setLastWallStartPoint(null);
    setDrawMessage(null);
    setErasePreviewKeys([]);
    clearEraseStrokeState();
    clearBrushStrokeState();
    ignoreNextEraseClick.current = false;
    ignoreNextBrushClick.current = false;
  }, [
    clearBrushStrokeState,
    clearEraseStrokeState,
    setHoverSnapPointIfChanged,
    setPointerPositionIfChanged,
    setPointerPreviewIfChanged,
    setPointerSnapPointIfChanged,
  ]);

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

  const previewSegments = useMemo(
    () =>
      computePreviewSegments(
        drawAnchor,
        pointerPreview,
        currentFloorId,
        activeDrawTool,
        selectedWallColor,
      ),
    [
      activeDrawTool,
      currentFloorId,
      drawAnchor,
      pointerPreview,
      selectedWallColor,
    ],
  );

  const drawContextKey = `${activeDrawTool}:${currentFloorId}:${isEditMode}`;
  const [previousDrawContextKey, setPreviousDrawContextKey] =
    useState(drawContextKey);

  if (previousDrawContextKey !== drawContextKey) {
    setPreviousDrawContextKey(drawContextKey);
    setDrawAnchor(null);
    setPointerPreviewIfChanged(null);
    setHoverSnapPointIfChanged(null);
    setPointerPositionIfChanged(null);
    setPointerSnapPointIfChanged(null);
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
      setErasePreviewKeysIfChanged(preview.affectedKeys);
    },
    [previewEraseWallAtPointer, setErasePreviewKeysIfChanged],
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
      if (trackPointerPosition) {
        setPointerPositionIfChanged(sample.pointer);
        setPointerSnapPointIfChanged(sample.snappedPoint);
      }

      if (activeDrawTool === "wall-erase") {
        setHoverSnapPointIfChanged(sample.snappedPoint);
        setPointerPreviewIfChanged(null);

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
        setHoverSnapPointIfChanged(sample.snappedPoint);
        setPointerPreviewIfChanged(null);
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
        setPointerPreviewIfChanged(sample.snappedPoint);
      } else {
        setPointerPreviewIfChanged(null);
      }

      setHoverSnapPointIfChanged(sample.snappedPoint);
      return;
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
      setHoverSnapPointIfChanged,
      setPointerPositionIfChanged,
      setPointerPreviewIfChanged,
      setPointerSnapPointIfChanged,
      selectedWallColor,
      trackPointerPosition,
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

        setHoverSnapPointIfChanged(sample.snappedPoint);
        setPointerPreviewIfChanged(null);
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

        setHoverSnapPointIfChanged(sample.snappedPoint);
        setPointerPreviewIfChanged(null);
        return true;
      }

      const drawPoint =
        activeDrawTool === "wall" && !drawAnchor && hoverSnapPoint
          ? hoverSnapPoint
          : sample.snappedPoint;

      setPointerPreviewIfChanged(drawPoint);

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
        setPointerPreviewIfChanged(null);
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
        setPointerPreviewIfChanged(null);
        setHoverSnapPointIfChanged(null);
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
      setPointerPreviewIfChanged(null);
      setHoverSnapPointIfChanged(null);
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
      setHoverSnapPointIfChanged,
      setPointerPreviewIfChanged,
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

  const paneCursorClass = useMemo(
    () =>
      computePaneCursorClass(
        isEditMode,
        activeDrawTool,
        drawAnchor,
        pointerPreview,
      ),
    [activeDrawTool, drawAnchor, isEditMode, pointerPreview],
  );

  return {
    drawAnchor,
    hoverSnapPoint,
    pointerPosition: trackPointerPosition ? pointerPosition : null,
    pointerSnapPoint: trackPointerPosition ? pointerSnapPoint : null,
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
