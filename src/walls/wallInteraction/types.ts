import type {
  DrawTool,
  FloorId,
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
  currentFloorId: FloorId | null;
  selectedWallColor: WallColor;
  wallEraserSize: number;
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
  /**
   * Where the pane was pressed when the press set the anchor: its release
   * may end the shape, unless it stays near the press, as a click does.
   */
  pressPointer: Position | null;
  /** Counts the shapes refused here, so each one flashes the toolbar (A19). */
  refusals: number;
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
  erasePreviewPointer: Position | null;
  isEraseStrokeActive: boolean;
  wallEraserSize: number;
  paneCursorClass: string;
}

export interface WallInteractionResult {
  state: WallInteractionState;
  handled: boolean;
}
