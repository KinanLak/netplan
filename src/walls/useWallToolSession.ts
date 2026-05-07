import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  const addWallLine = useMapStore((state) => state.addWallLine);
  const addWallRoom = useMapStore((state) => state.addWallRoom);
  const eraseWallAtPointer = useMapStore((state) => state.eraseWallAtPointer);
  const eraseWallStroke = useMapStore((state) => state.eraseWallStroke);
  const previewEraseWallAtPointer = useMapStore(
    (state) => state.previewEraseWallAtPointer,
  );

  const [interactionState, setInteractionState] = useState(
    createWallInteractionState,
  );
  const stateRef = useRef(interactionState);

  useLayoutEffect(() => {
    stateRef.current = interactionState;
  }, [interactionState]);

  const context: WallInteractionContext = {
    isEditMode,
    activeDrawTool,
    currentFloorId,
    selectedWallColor,
    trackPointerPosition: isDebugPanelVisible,
  };

  const adapter: WallInteractionAdapter = {
    setActiveDrawTool,
    addWallLine,
    addWallRoom,
    eraseWallAtPointer,
    eraseWallStroke,
    previewEraseWallAtPointer,
  };

  const commitInteractionState = (nextState: WallInteractionState) => {
    stateRef.current = nextState;
    setInteractionState(nextState);
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
    };

    window.addEventListener("mouseup", handlePointerRelease);
    window.addEventListener("blur", handlePointerRelease);

    return () => {
      window.removeEventListener("mouseup", handlePointerRelease);
      window.removeEventListener("blur", handlePointerRelease);
    };
  }, [
    activeDrawTool,
    currentFloorId,
    isDebugPanelVisible,
    isEditMode,
    selectedWallColor,
  ]);

  const toggleDebugPanel = () => {
    setIsDebugVisible((currentVisibility) => !currentVisibility);
  };

  const cancelTool = () => {
    commitInteractionState(cancelWallTool(adapter));
  };

  const handlePaneMouseMove = (event: ReactMouseEvent) => {
    commitInteractionState(
      moveWallPointer(
        stateRef.current,
        context,
        adapter,
        getPointerSample(event),
        event.buttons,
      ),
    );
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
