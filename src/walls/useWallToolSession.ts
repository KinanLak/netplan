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
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedWallColor,
} from "@/store/selectors";
import { useMapDocument } from "@/map-session/useMapDocument";
import { snapPositionToWallGrid } from "@/walls/gridGeometry";
import {
  cancelWallTool,
  clickWallPane,
  contextCancelWallInteraction,
  createWallInteractionState,
  getWallInteractionViewModel,
  moveWallPointer,
  releaseWallPointer,
  resetWallInteractionState,
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
  const [isDebugVisible, setIsDebugVisible] = useState(false);
  const isDebugPanelVisible =
    isEditMode && activeDrawTool !== "device" && isDebugVisible;

  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const { commands } = useMapDocument();

  const [interactionState, setInteractionState] = useState(
    createWallInteractionState,
  );
  const stateRef = useRef(interactionState);
  const isHistoryGroupOpenRef = useRef(false);
  const beginHistoryGroupRef = useRef(commands.beginHistoryGroup);
  const endHistoryGroupRef = useRef(commands.endHistoryGroup);

  useLayoutEffect(() => {
    stateRef.current = interactionState;
  }, [interactionState]);

  useEffect(() => {
    beginHistoryGroupRef.current = commands.beginHistoryGroup;
    endHistoryGroupRef.current = commands.endHistoryGroup;
  }, [commands.beginHistoryGroup, commands.endHistoryGroup]);

  const context: WallInteractionContext = {
    isEditMode,
    activeDrawTool,
    currentFloorId,
    selectedWallColor,
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

  const closeHistoryGroup = useCallback(() => {
    if (!isHistoryGroupOpenRef.current) return;
    endHistoryGroupRef.current();
    isHistoryGroupOpenRef.current = false;
  }, []);

  const openStrokeHistoryGroup = (buttons: number) => {
    const isStrokeTool =
      activeDrawTool === "wall-brush" || activeDrawTool === "wall-erase";
    const isPrimaryButtonPressed = (buttons & 1) === 1;
    if (!isStrokeTool || !isPrimaryButtonPressed) return;
    if (isHistoryGroupOpenRef.current) return;
    beginHistoryGroupRef.current();
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
    const result = contextCancelWallInteraction(
      stateRef.current,
      context,
      adapter,
    );

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
