import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Position, WallDraft } from "@/types/map";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { clampWallEraserSize } from "@/lib/constants";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedWallColor,
  useWallEraserSize,
} from "@/store/selectors";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { snapPositionToWallGrid } from "@/walls/gridGeometry";
import {
  cancelWallTool,
  clickWallPane,
  createWallInteractionState,
  getWallInteractionViewModel,
  moveWallPointer,
  releaseWallPointer,
  resetWallInteractionState,
  suppressWallContextMenu,
} from "@/walls/wallInteraction";
import type {
  PointerSample,
  WallInteractionAdapter,
  WallInteractionContext,
} from "@/walls/wallInteraction";
import type { WallInteractionState } from "@/walls/wallInteraction/types";

export interface WallToolSession {
  drawAnchor: Position | null;
  hoverSnapPoint: Position | null;
  pointerPosition: Position | null;
  pointerSnapPoint: Position | null;
  lastWallStartPoint: Position | null;
  drawMessage: string | null;
  previewSegments: Array<WallDraft>;
  erasePreviewKeys: Array<string>;
  erasePreviewPointer: Position | null;
  wallEraserSize: number;
  paneCursorClass: string;
  isDebugPanelVisible: boolean;
  toggleDebugPanel: () => void;
  cancelTool: () => void;
  handlePaneMouseMove: (event: ReactMouseEvent) => void;
  handlePaneClick: (event: ReactMouseEvent) => boolean;
  handleContextMenu: (event: ReactMouseEvent | MouseEvent) => boolean;
}

export const useWallToolSession = (): WallToolSession => {
  const reactFlow = useReactFlow();

  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const currentFloorId = useCurrentFloorId();
  const selectedWallColor = useSelectedWallColor();
  const wallEraserSize = useWallEraserSize();
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  const isDebugPanelVisible =
    isEditMode && activeDrawTool !== "device" && isDebugVisible;

  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const setWallEraserSize = useMapStore((state) => state.setWallEraserSize);
  const { commands } = useMapDocumentActions();

  const [interactionState, setInteractionState] = useState(
    createWallInteractionState,
  );
  const stateRef = useRef(interactionState);
  const isHistoryGroupOpenRef = useRef(false);

  useLayoutEffect(() => {
    stateRef.current = interactionState;
  }, [interactionState]);

  const context: WallInteractionContext = {
    isEditMode,
    activeDrawTool,
    currentFloorId,
    selectedWallColor,
    wallEraserSize,
    trackPointerPosition: isDebugPanelVisible,
  };

  const adapter: WallInteractionAdapter = {
    setActiveDrawTool,
    addWallLine: commands.addWallLine,
    addWallRoom: commands.addWallRoom,
    eraseWallAtPointer: commands.eraseWallAtPointer,
    eraseWallStroke: commands.eraseWallStroke,
    previewEraseWallAtPointer: commands.previewEraseWallAtPointer,
  };

  const commitInteractionState = (nextState: WallInteractionState) => {
    stateRef.current = nextState;
    setInteractionState(nextState);
  };

  const resizeWallEraser = (nextSize: number) => {
    const clampedSize = clampWallEraserSize(nextSize);
    setWallEraserSize(clampedSize);

    const currentState = stateRef.current;
    if (
      activeDrawTool !== "wall-erase" ||
      !currentFloorId ||
      !currentState.pointerPosition ||
      !currentState.pointerSnapPoint
    ) {
      return;
    }

    const preview = commands.previewEraseWallAtPointer({
      floorId: currentFloorId,
      pointer: currentState.pointerPosition,
      snappedPoint: currentState.pointerSnapPoint,
      eraserSize: clampedSize,
    });

    commitInteractionState({
      ...currentState,
      erasePreviewKeys: preview.affectedKeys,
    });
  };

  useShortcutIntentEffect("wall-eraser-size-increase", () => {
    resizeWallEraser(useMapStore.getState().wallEraserSize + 1);
  });

  useShortcutIntentEffect("wall-eraser-size-decrease", () => {
    resizeWallEraser(useMapStore.getState().wallEraserSize - 1);
  });

  const closeHistoryGroup = useCallback(() => {
    if (!isHistoryGroupOpenRef.current) return;
    commands.endHistoryGroup();
    isHistoryGroupOpenRef.current = false;
  }, [commands]);

  const openStrokeHistoryGroup = (buttons: number) => {
    const isStrokeTool =
      activeDrawTool === "wall-brush" || activeDrawTool === "wall-erase";
    const isPrimaryButtonPressed = (buttons & 1) === 1;
    if (!isStrokeTool || !isPrimaryButtonPressed) return;
    if (isHistoryGroupOpenRef.current) return;
    commands.beginHistoryGroup();
    isHistoryGroupOpenRef.current = true;
  };

  const getPointerSample = (event: ReactMouseEvent): PointerSample => {
    const pointer = reactFlow.screenToFlowPosition(
      { x: event.clientX, y: event.clientY },
      { snapToGrid: false },
    );

    return {
      pointer,
      snappedPoint: snapPositionToWallGrid(pointer),
    };
  };

  const drawContextKey = `${activeDrawTool}:${currentFloorId}:${isEditMode}`;
  const [previousDrawContextKey, setPreviousDrawContextKey] =
    useState(drawContextKey);

  useEffect(
    () => () => {
      closeHistoryGroup();
    },
    [drawContextKey, closeHistoryGroup],
  );

  if (previousDrawContextKey !== drawContextKey) {
    const resetState = resetWallInteractionState();
    setInteractionState(resetState);
    setPreviousDrawContextKey(drawContextKey);
  }

  useEffect(() => {
    const releaseContext: WallInteractionContext = {
      isEditMode,
      activeDrawTool,
      currentFloorId,
      selectedWallColor,
      wallEraserSize,
      trackPointerPosition: isDebugPanelVisible,
    };

    const handlePointerRelease = () => {
      commitInteractionState(
        releaseWallPointer(stateRef.current, releaseContext),
      );
      closeHistoryGroup();
    };

    window.addEventListener("mouseup", handlePointerRelease);
    window.addEventListener("blur", handlePointerRelease);

    return () => {
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("blur", handlePointerRelease);
    };
  }, [
    activeDrawTool,
    closeHistoryGroup,
    currentFloorId,
    isDebugPanelVisible,
    isEditMode,
    selectedWallColor,
    wallEraserSize,
  ]);

  const toggleDebugPanel = () => {
    setIsDebugVisible((currentVisibility) => !currentVisibility);
  };

  const cancelTool = () => {
    closeHistoryGroup();
    commitInteractionState(cancelWallTool(adapter));
  };

  const handlePaneMouseMove = (event: ReactMouseEvent) => {
    openStrokeHistoryGroup(event.buttons);
    const nextState = moveWallPointer(
      stateRef.current,
      context,
      adapter,
      getPointerSample(event),
      event.buttons,
    );

    commitInteractionState(nextState);
  };

  const handlePaneClick = (event: ReactMouseEvent): boolean => {
    const result = clickWallPane(
      stateRef.current,
      context,
      adapter,
      getPointerSample(event),
    );

    commitInteractionState(result.state);
    return result.handled;
  };

  const handleContextMenu = (event: ReactMouseEvent | MouseEvent): boolean => {
    const result = suppressWallContextMenu(stateRef.current, context);

    if (result.handled) {
      event.preventDefault();
      closeHistoryGroup();
    }

    commitInteractionState(result.state);
    return result.handled;
  };

  return {
    ...getWallInteractionViewModel(interactionState, context),
    isDebugPanelVisible,
    toggleDebugPanel,
    cancelTool,
    handlePaneMouseMove,
    handlePaneClick,
    handleContextMenu,
  };
};
