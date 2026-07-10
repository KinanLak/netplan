import { describe, expect, it, mock } from "bun:test";
import type { FloorId, WallCommandResult } from "@/types/map";
import { snapPositionToWallGrid } from "@/walls/gridGeometry";
import { clickWallPane, moveWallPointer } from "./gestures";
import {
  areWallInteractionStatesEqual,
  createWallInteractionState,
  stabilizeWallInteractionState,
} from "./state";
import type {
  PointerSample,
  WallInteractionAdapter,
  WallInteractionContext,
} from "./types";

const makeContext = (
  overrides: Partial<WallInteractionContext> = {},
): WallInteractionContext => ({
  isEditMode: true,
  activeDrawTool: "wall",
  currentFloorId: "floor-1" as FloorId,
  selectedWallColor: "concrete",
  wallEraserSize: 1,
  trackPointerPosition: false,
  ...overrides,
});

const unchangedResult = (
  reason: WallCommandResult["reason"],
): WallCommandResult => ({
  changed: false,
  nextWalls: [],
  affectedKeys: [],
  reason,
});

const makeAdapter = (): WallInteractionAdapter => ({
  setActiveDrawTool: mock(() => {}),
  addWallLine: mock(() => unchangedResult("invalid-line")),
  addWallRoom: mock(() => unchangedResult("invalid-room")),
  eraseWallAtPointer: mock(() => unchangedResult("no-wall-at-pointer")),
  eraseWallStroke: mock(() => unchangedResult("empty-stroke")),
  previewEraseWallAtPointer: mock(() => unchangedResult("preview-miss")),
});

const sampleAt = (x: number, y: number): PointerSample => ({
  pointer: { x, y },
  snappedPoint: snapPositionToWallGrid({ x, y }),
});

describe("wall gesture state identity", () => {
  it("moveWallPointer keeps the state identity while hovering the same cell", () => {
    const context = makeContext();
    const adapter = makeAdapter();
    const first = moveWallPointer(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(105.2, 104.9),
      0,
    );

    const second = moveWallPointer(
      first,
      context,
      adapter,
      sampleAt(106.4, 105.6),
      0,
    );

    expect(second).toBe(first);
  });

  it("moveWallPointer produces a new state when the snapped cell changes", () => {
    const context = makeContext();
    const adapter = makeAdapter();
    const first = moveWallPointer(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(105, 105),
      0,
    );

    const second = moveWallPointer(
      first,
      context,
      adapter,
      sampleAt(145, 105),
      0,
    );

    expect(second).not.toBe(first);
    expect(second.hoverSnapPoint).not.toEqual(first.hoverSnapPoint);
  });

  it("moveWallPointer tracks the raw pointer for the eraser preview", () => {
    const context = makeContext({ activeDrawTool: "wall-erase" });
    const adapter = makeAdapter();
    const first = moveWallPointer(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(105.2, 104.9),
      0,
    );

    const second = moveWallPointer(
      first,
      context,
      adapter,
      sampleAt(105.9, 105.3),
      0,
    );

    // The eraser preview follows the cursor, so each move must produce a
    // fresh state carrying the raw pointer.
    expect(second).not.toBe(first);
    expect(second.pointerPosition).toEqual({ x: 105.9, y: 105.3 });
  });

  it("moveWallPointer skips raw pointer tracking for draw tools", () => {
    const context = makeContext({ activeDrawTool: "wall" });
    const adapter = makeAdapter();
    const moved = moveWallPointer(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(105.2, 104.9),
      0,
    );

    expect(moved.pointerPosition).toBeNull();
  });

  it("clickWallPane still anchors a draw point after stabilization", () => {
    const context = makeContext();
    const adapter = makeAdapter();
    const result = clickWallPane(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(105, 105),
    );

    expect(result.handled).toBe(true);
    expect(result.state.drawAnchor).not.toBeNull();
  });

  it("stabilizeWallInteractionState returns the previous state for value-equal copies", () => {
    const state = moveWallPointer(
      createWallInteractionState(),
      makeContext(),
      makeAdapter(),
      sampleAt(105, 105),
      0,
    );
    const copy = {
      ...state,
      hoverSnapPoint: state.hoverSnapPoint ? { ...state.hoverSnapPoint } : null,
      erasePreviewKeys: [...state.erasePreviewKeys],
    };

    expect(areWallInteractionStatesEqual(state, copy)).toBe(true);
    expect(stabilizeWallInteractionState(state, copy)).toBe(state);
  });
});
