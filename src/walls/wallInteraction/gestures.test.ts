import { describe, expect, it, mock } from "bun:test";
import type { FloorId, WallCommandResult } from "@/types/map";
import { snapPositionToWallGrid } from "@/walls/gridGeometry";
import { clickWallPane, moveWallPointer, pressWallPane } from "./gestures";
import {
  releaseWallPointer,
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

describe("press and drag", () => {
  const applied = (): WallCommandResult => ({
    changed: true,
    nextWalls: [],
    affectedKeys: [],
    reason: "applied",
  });

  it("draws a room from where the press starts to where it is released", () => {
    const context = makeContext({ activeDrawTool: "room" });
    const adapter = { ...makeAdapter(), addWallRoom: mock(applied) };
    const pressed = pressWallPane(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(40, 40),
    );
    expect(pressed.drawAnchor).toEqual(sampleAt(40, 40).snappedPoint);

    const released = clickWallPane(
      pressed,
      context,
      adapter,
      sampleAt(200, 160),
    );
    expect(adapter.addWallRoom).toHaveBeenCalledTimes(1);
    expect(released.state.drawAnchor).toBe(null);
    expect(released.state.pressPointer).toBe(null);
  });

  it("keeps the anchor of a press released in place, for a second click", () => {
    const context = makeContext({ activeDrawTool: "room" });
    const adapter = { ...makeAdapter(), addWallRoom: mock(applied) };
    const pressed = pressWallPane(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(40, 40),
    );
    const clicked = clickWallPane(pressed, context, adapter, sampleAt(41, 41));
    expect(adapter.addWallRoom).not.toHaveBeenCalled();
    expect(clicked.state.drawAnchor).toEqual(pressed.drawAnchor);

    const second = clickWallPane(
      clicked.state,
      context,
      adapter,
      sampleAt(200, 160),
    );
    expect(adapter.addWallRoom).toHaveBeenCalledTimes(1);
    expect(second.state.drawAnchor).toBe(null);
  });

  it("takes a click on a cell's edge for a click, not a two-cell wall", () => {
    const context = makeContext();
    const adapter = { ...makeAdapter(), addWallLine: mock(applied) };
    // The hover snapped above the edge at y = 140, the release below it.
    const hovered = moveWallPointer(
      createWallInteractionState(),
      context,
      adapter,
      sampleAt(690, 139.6),
      0,
    );
    const pressed = pressWallPane(
      hovered,
      context,
      adapter,
      sampleAt(690, 139.6),
    );
    const clicked = clickWallPane(
      pressed,
      context,
      adapter,
      sampleAt(690, 140.2),
    );
    expect(sampleAt(690, 140.2).snappedPoint).not.toEqual(pressed.drawAnchor);
    expect(adapter.addWallLine).not.toHaveBeenCalled();
    expect(clicked.state.drawAnchor).toEqual(pressed.drawAnchor);
  });

  it("counts each refused wall or room, not one that only repeats walls", () => {
    const refusedBy = (reason: WallCommandResult["reason"]) => {
      const adapter = {
        ...makeAdapter(),
        addWallLine: mock(() => unchangedResult(reason)),
      };
      const context = makeContext();
      const anchored = clickWallPane(
        createWallInteractionState(),
        context,
        adapter,
        sampleAt(40, 40),
      ).state;
      const once = clickWallPane(anchored, context, adapter, sampleAt(200, 40));
      return clickWallPane(once.state, context, adapter, sampleAt(220, 40))
        .state.refusals;
    };
    expect(refusedBy("collision-with-device")).toBe(2);
    expect(refusedBy("already-exists")).toBe(0);
  });

  it("flashes a brush stroke once each time it reaches a device", () => {
    const context = makeContext({ activeDrawTool: "wall-brush" });
    const blocked = (x: number) => x >= 100 && x <= 140;
    const adapter = {
      ...makeAdapter(),
      addWallLine: mock((line: { end: { x: number } }) =>
        blocked(line.end.x)
          ? unchangedResult("collision-with-device")
          : applied(),
      ),
    };
    let state = createWallInteractionState();
    for (const x of [40, 80, 100, 120, 140, 160, 120]) {
      state = moveWallPointer(state, context, adapter, sampleAt(x, 40), 1);
    }
    // Into the device, out of it, and into it again: two flashes.
    expect(state.refusals).toBe(2);
    expect(state.drawMessage).toBe("Mur refusé : il traverse un équipement.");

    // Released, then a new stroke straight into the same device flashes too.
    state = releaseWallPointer(state, context);
    state = moveWallPointer(state, context, adapter, sampleAt(120, 40), 1);
    expect(state.refusals).toBe(3);
  });

  it("does nothing for the brush, the eraser, or a shape already started", () => {
    const adapter = makeAdapter();
    const idle = createWallInteractionState();
    for (const tool of ["wall-brush", "wall-erase"] as const) {
      expect(
        pressWallPane(
          idle,
          makeContext({ activeDrawTool: tool }),
          adapter,
          sampleAt(40, 40),
        ),
      ).toBe(idle);
    }
    const started = { ...idle, drawAnchor: { x: 0, y: 0 } };
    expect(
      pressWallPane(started, makeContext(), adapter, sampleAt(40, 40)),
    ).toBe(started);
  });
});
