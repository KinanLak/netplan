import { describe, expect, it } from "bun:test";
import type {
  DrawTool,
  WallCommandReason,
  WallCommandResult,
  RoomDraft,
  WallDraft,
  WallPointerInput,
  WallStrokeInput,
} from "@/types/map";
import {
  clickWallPane,
  contextCancelWallInteraction,
  createWallInteractionState,
  moveWallPointer,
  resetWallInteractionState,
} from "@/walls/wallInteraction";
import type {
  PointerSample,
  WallInteractionAdapter,
  WallInteractionContext,
} from "@/walls/wallInteraction";

const floorId = "floor-a";

interface AdapterCalls {
  setActiveDrawTool: Array<DrawTool>;
  addWallLine: Array<WallDraft>;
  addWallRoom: Array<RoomDraft>;
  eraseWallAtPointer: Array<WallPointerInput>;
  eraseWallStroke: Array<WallStrokeInput>;
  previewEraseWallAtPointer: Array<WallPointerInput>;
}

const commandResult = (
  changed: boolean,
  reason: WallCommandReason = changed ? "applied" : "no-wall-at-pointer",
  affectedKeys: Array<string> = [],
): WallCommandResult => ({
  changed,
  nextWalls: [],
  affectedKeys,
  reason,
});

const createAdapter = (
  options: {
    erasePreviewKeys?: Array<string>;
    addLineChanged?: boolean;
    addLineReason?: WallCommandReason;
    addRoomChanged?: boolean;
    addRoomReason?: WallCommandReason;
    eraseChanged?: boolean;
    strokeChanged?: boolean;
  } = {},
): { adapter: WallInteractionAdapter; calls: AdapterCalls } => {
  const calls: AdapterCalls = {
    setActiveDrawTool: [],
    addWallLine: [],
    addWallRoom: [],
    eraseWallAtPointer: [],
    eraseWallStroke: [],
    previewEraseWallAtPointer: [],
  };

  return {
    calls,
    adapter: {
      setActiveDrawTool: (tool) => calls.setActiveDrawTool.push(tool),
      addWallLine: (line) => {
        calls.addWallLine.push(line);
        return commandResult(
          options.addLineChanged ?? true,
          options.addLineReason,
        );
      },
      addWallRoom: (room) => {
        calls.addWallRoom.push(room);
        return commandResult(
          options.addRoomChanged ?? true,
          options.addRoomReason,
        );
      },
      eraseWallAtPointer: (input) => {
        calls.eraseWallAtPointer.push(input);
        return commandResult(options.eraseChanged ?? true);
      },
      eraseWallStroke: (input) => {
        calls.eraseWallStroke.push(input);
        return commandResult(options.strokeChanged ?? true);
      },
      previewEraseWallAtPointer: (input) => {
        calls.previewEraseWallAtPointer.push(input);
        return commandResult(
          false,
          "preview-hit",
          options.erasePreviewKeys ?? [],
        );
      },
    },
  };
};

const context = (activeDrawTool: DrawTool): WallInteractionContext => ({
  isEditMode: true,
  activeDrawTool,
  currentFloorId: floorId,
  selectedWallColor: "concrete",
  trackPointerPosition: false,
});

const sample = (x: number, y: number): PointerSample => ({
  pointer: { x, y },
  snappedPoint: { x, y },
});

describe("wall interaction", () => {
  it("anchors a wall draw and clears it on context cancel", () => {
    const { adapter, calls } = createAdapter();
    const anchored = clickWallPane(
      createWallInteractionState(),
      context("wall"),
      adapter,
      sample(10, 10),
    ).state;

    const canceled = contextCancelWallInteraction(
      anchored,
      context("wall"),
      adapter,
    );

    expect(anchored.drawAnchor).toEqual({ x: 10, y: 10 });
    expect(canceled.handled).toBe(true);
    expect(canceled.state).toEqual(resetWallInteractionState());
    expect(calls.setActiveDrawTool).toEqual(["device"]);
  });

  it("clears a wall anchor when the next click is on the same snap point", () => {
    const { adapter } = createAdapter();
    const anchored = clickWallPane(
      createWallInteractionState(),
      context("wall"),
      adapter,
      sample(10, 10),
    ).state;

    const cleared = clickWallPane(
      anchored,
      context("wall"),
      adapter,
      sample(10, 10),
    );

    expect(cleared.handled).toBe(true);
    expect(cleared.state.drawAnchor).toBe(null);
    expect(cleared.state.pointerPreview).toBe(null);
  });

  it("ignores wall tools outside editable floors", () => {
    const { adapter } = createAdapter();
    const state = createWallInteractionState();
    const disabledContext = context("wall");

    const moved = moveWallPointer(
      state,
      { ...disabledContext, isEditMode: false },
      adapter,
      sample(10, 10),
      0,
    );
    const clicked = clickWallPane(
      state,
      { ...disabledContext, currentFloorId: null },
      adapter,
      sample(10, 10),
    );

    expect(moved).toBe(state);
    expect(clicked).toEqual({ state, handled: false });
  });

  it("tracks pointer movement and previews a pending wall segment", () => {
    const { adapter } = createAdapter();
    const state = {
      ...createWallInteractionState(),
      drawAnchor: { x: 10, y: 10 },
    };

    const moved = moveWallPointer(
      state,
      { ...context("wall"), trackPointerPosition: true },
      adapter,
      {
        pointer: { x: 24, y: 26 },
        snappedPoint: { x: 30, y: 30 },
      },
      0,
    );

    expect(moved.pointerPosition).toEqual({ x: 24, y: 26 });
    expect(moved.pointerSnapPoint).toEqual({ x: 30, y: 30 });
    expect(moved.pointerPreview).toEqual({ x: 30, y: 30 });
    expect(moved.hoverSnapPoint).toEqual({ x: 30, y: 30 });
    expect(moved.erasePreviewKeys).toEqual([]);
  });

  it("adds a wall on the second click and resets the draw state", () => {
    const { adapter, calls } = createAdapter();
    const anchored = clickWallPane(
      createWallInteractionState(),
      context("wall"),
      adapter,
      sample(10, 10),
    ).state;

    const finished = clickWallPane(
      anchored,
      context("wall"),
      adapter,
      sample(50, 10),
    );

    expect(calls.addWallLine).toEqual([
      {
        floorId,
        start: { x: 10, y: 10 },
        end: { x: 50, y: 10 },
        color: "concrete",
      },
    ]);
    expect(finished.state.drawAnchor).toBe(null);
    expect(finished.state.pointerPreview).toBe(null);
    expect(finished.state.hoverSnapPoint).toBe(null);
    expect(finished.state.drawMessage).toBe(null);
  });

  it("keeps a wall anchor when adding the segment is rejected", () => {
    const { adapter } = createAdapter({
      addLineChanged: false,
      addLineReason: "collision-with-device",
    });
    const anchored = clickWallPane(
      createWallInteractionState(),
      context("wall"),
      adapter,
      sample(10, 10),
    ).state;

    const rejected = clickWallPane(
      anchored,
      context("wall"),
      adapter,
      sample(50, 10),
    );

    expect(rejected.state.drawAnchor).toEqual({ x: 10, y: 10 });
    expect(rejected.state.pointerPreview).toEqual({ x: 50, y: 10 });
    expect(rejected.state.drawMessage).toBe(
      "Mur refuse: collision avec un device.",
    );
  });

  it("adds a room from the anchored drag rectangle", () => {
    const { adapter, calls } = createAdapter();
    const anchored = clickWallPane(
      createWallInteractionState(),
      context("room"),
      adapter,
      sample(10, 10),
    ).state;

    const finished = clickWallPane(
      anchored,
      context("room"),
      adapter,
      sample(50, 50),
    );

    expect(calls.addWallRoom).toEqual([
      {
        floorId,
        start: { x: 10, y: 10 },
        end: { x: 50, y: 50 },
        color: "concrete",
      },
    ]);
    expect(finished.state.drawAnchor).toBe(null);
  });

  it("keeps a room anchor when adding the room is rejected", () => {
    const { adapter } = createAdapter({
      addRoomChanged: false,
      addRoomReason: "invalid-room",
    });
    const anchored = clickWallPane(
      createWallInteractionState(),
      context("room"),
      adapter,
      sample(10, 10),
    ).state;

    const rejected = clickWallPane(
      anchored,
      context("room"),
      adapter,
      sample(10, 50),
    );

    expect(rejected.state.drawAnchor).toEqual({ x: 10, y: 10 });
    expect(rejected.state.pointerPreview).toEqual({ x: 10, y: 50 });
    expect(rejected.state.drawMessage).toBe("Salle refusée: rectangle vide.");
  });

  it("suppresses the click that follows a brush drag", () => {
    const { adapter, calls } = createAdapter();
    const dragging = moveWallPointer(
      createWallInteractionState(),
      context("wall-brush"),
      adapter,
      sample(10, 10),
      1,
    );

    const clicked = clickWallPane(
      dragging,
      context("wall-brush"),
      adapter,
      sample(10, 10),
    );

    expect(calls.addWallLine).toHaveLength(1);
    expect(clicked.handled).toBe(true);
    expect(clicked.state.ignoreNextBrushClick).toBe(false);
    expect(calls.addWallLine).toHaveLength(1);
  });

  it("continues a brush stroke from the previous snap point", () => {
    const { adapter, calls } = createAdapter();
    const firstMove = moveWallPointer(
      createWallInteractionState(),
      context("wall-brush"),
      adapter,
      sample(10, 10),
      1,
    );

    const secondMove = moveWallPointer(
      firstMove,
      context("wall-brush"),
      adapter,
      sample(30, 10),
      1,
    );

    expect(calls.addWallLine).toEqual([
      {
        floorId,
        start: { x: 10, y: 10 },
        end: { x: 11, y: 10 },
        color: "concrete",
      },
      {
        floorId,
        start: { x: 10, y: 10 },
        end: { x: 30, y: 10 },
        color: "concrete",
      },
    ]);
    expect(secondMove.brushStrokeLastSample).toEqual(sample(30, 10));
    expect(secondMove.ignoreNextBrushClick).toBe(true);
  });

  it("preserves a brush draw message when stroke extension is unchanged", () => {
    const { adapter } = createAdapter({ addLineChanged: false });
    const state = {
      ...createWallInteractionState(),
      drawMessage: "previous warning",
      isBrushStrokeActive: true,
      brushStrokeLastSample: sample(10, 10),
    };

    const moved = moveWallPointer(
      state,
      context("wall-brush"),
      adapter,
      sample(30, 10),
      1,
    );

    expect(moved.drawMessage).toBe("previous warning");
  });

  it("clears brush stroke state when the primary button is released", () => {
    const { adapter } = createAdapter();
    const state = {
      ...createWallInteractionState(),
      isBrushStrokeActive: true,
      brushStrokeLastSample: sample(10, 10),
    };

    const moved = moveWallPointer(
      state,
      context("wall-brush"),
      adapter,
      sample(30, 10),
      0,
    );

    expect(moved.isBrushStrokeActive).toBe(false);
    expect(moved.brushStrokeLastSample).toBe(null);
  });

  it("reports brush collisions on click", () => {
    const { adapter } = createAdapter({
      addLineChanged: false,
      addLineReason: "collision-with-device",
    });

    const clicked = clickWallPane(
      createWallInteractionState(),
      context("wall-brush"),
      adapter,
      sample(10, 10),
    );

    expect(clicked.state.drawMessage).toBe(
      "Mur refuse: collision avec un device.",
    );
  });

  it("suppresses the click that follows an erase drag", () => {
    const { adapter, calls } = createAdapter({ erasePreviewKeys: ["wall-a"] });
    const firstMove = moveWallPointer(
      createWallInteractionState(),
      context("wall-erase"),
      adapter,
      sample(10, 10),
      1,
    );
    const secondMove = moveWallPointer(
      firstMove,
      context("wall-erase"),
      adapter,
      sample(30, 10),
      1,
    );

    const clicked = clickWallPane(
      secondMove,
      context("wall-erase"),
      adapter,
      sample(30, 10),
    );

    expect(calls.eraseWallStroke).toHaveLength(1);
    expect(clicked.state.ignoreNextEraseClick).toBe(false);
    expect(calls.eraseWallAtPointer).toHaveLength(0);
  });

  it("continues an erase stroke from the previous pointer sample", () => {
    const { adapter, calls } = createAdapter();
    const state = {
      ...createWallInteractionState(),
      drawMessage: "previous warning",
      isEraseStrokeActive: true,
      eraseStrokeLastSample: sample(10, 10),
    };

    const moved = moveWallPointer(
      state,
      context("wall-erase"),
      adapter,
      sample(30, 10),
      1,
    );

    expect(calls.eraseWallStroke).toEqual([
      {
        floorId,
        fromPointer: { x: 10, y: 10 },
        fromSnappedPoint: { x: 10, y: 10 },
        toPointer: { x: 30, y: 10 },
        toSnappedPoint: { x: 30, y: 10 },
      },
    ]);
    expect(moved.drawMessage).toBe(null);
    expect(moved.ignoreNextEraseClick).toBe(true);
  });

  it("preserves an erase draw message when stroke erase is unchanged", () => {
    const { adapter } = createAdapter({ strokeChanged: false });
    const state = {
      ...createWallInteractionState(),
      drawMessage: "previous warning",
      isEraseStrokeActive: true,
      eraseStrokeLastSample: sample(10, 10),
    };

    const moved = moveWallPointer(
      state,
      context("wall-erase"),
      adapter,
      sample(30, 10),
      1,
    );

    expect(moved.drawMessage).toBe("previous warning");
  });

  it("clears erase stroke state when the primary button is released", () => {
    const { adapter } = createAdapter();
    const state = {
      ...createWallInteractionState(),
      isEraseStrokeActive: true,
      eraseStrokeLastSample: sample(10, 10),
    };

    const moved = moveWallPointer(
      state,
      context("wall-erase"),
      adapter,
      sample(30, 10),
      0,
    );

    expect(moved.isEraseStrokeActive).toBe(false);
    expect(moved.eraseStrokeLastSample).toBe(null);
  });

  it("reports a missed erase click", () => {
    const { adapter } = createAdapter({ eraseChanged: false });

    const clicked = clickWallPane(
      createWallInteractionState(),
      context("wall-erase"),
      adapter,
      sample(10, 10),
    );

    expect(clicked.state.drawMessage).toBe("Aucun bloc de mur a supprimer.");
    expect(clicked.state.pointerPreview).toBe(null);
  });

  it("uses the same erase preview seam for hover and click refresh", () => {
    const { adapter, calls } = createAdapter({ erasePreviewKeys: ["wall-a"] });
    const hovered = moveWallPointer(
      createWallInteractionState(),
      context("wall-erase"),
      adapter,
      sample(10, 10),
      0,
    );

    const clicked = clickWallPane(
      hovered,
      context("wall-erase"),
      adapter,
      sample(10, 10),
    );

    expect(hovered.erasePreviewKeys).toEqual(["wall-a"]);
    expect(clicked.state.erasePreviewKeys).toEqual(["wall-a"]);
    expect(calls.eraseWallAtPointer).toHaveLength(1);
    expect(calls.previewEraseWallAtPointer).toHaveLength(2);
  });
});
