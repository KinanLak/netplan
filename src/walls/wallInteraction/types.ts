import type {
  DrawTool,
  Position,
  RoomDraft,
  WallColor,
  WallCommandResult,
  WallDraft,
  WallPointerInput,
  WallStrokeInput,
} from "@/types/map";

export interface PointerSample {
  pointer: Position;
  snappedPoint: Position;
}

export interface WallInteractionContext {
  isEditMode: boolean;
  activeDrawTool: DrawTool;
  currentFloorId: string | null;
  selectedWallColor: WallColor;
  trackPointerPosition: boolean;
}

export interface WallInteractionAdapter {
  setActiveDrawTool: (tool: DrawTool) => void;
  addWallLine: (line: WallDraft) => WallCommandResult;
  addWallRoom: (room: RoomDraft) => WallCommandResult;
  eraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  eraseWallStroke: (input: WallStrokeInput) => WallCommandResult;
  previewEraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
}

export interface WallInteractionState {
  drawAnchor: Position | null;
  pointerPreview: Position | null;
  hoverSnapPoint: Position | null;
  pointerPosition: Position | null;
  pointerSnapPoint: Position | null;
  lastWallStartPoint: Position | null;
  drawMessage: string | null;
  erasePreviewKeys: Array<string>;
  eraseStrokeLastSample: PointerSample | null;
  isEraseStrokeActive: boolean;
  ignoreNextEraseClick: boolean;
  brushStrokeLastSample: PointerSample | null;
  isBrushStrokeActive: boolean;
  ignoreNextBrushClick: boolean;
}

export interface WallInteractionViewModel {
  drawAnchor: Position | null;
  hoverSnapPoint: Position | null;
  pointerPosition: Position | null;
  pointerSnapPoint: Position | null;
  lastWallStartPoint: Position | null;
  drawMessage: string | null;
  previewSegments: Array<WallDraft>;
  erasePreviewKeys: Array<string>;
  paneCursorClass: string;
}

export interface WallInteractionResult {
  state: WallInteractionState;
  handled: boolean;
}
