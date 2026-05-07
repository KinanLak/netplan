import { describe, expect, it } from "bun:test";
import type {
  DrawTool,
  WallCommandReason,
  WallCommandResult,
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
    eraseChanged?: boolean;
    strokeChanged?: boolean;
  } = {},
): { adapter: WallInteractionAdapter; calls: AdapterCalls } => {
  const calls: AdapterCalls = {
    setActiveDrawTool: [],
    addWallLine: [],
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
        return commandResult(true);
      },
      addWallRoom: () => commandResult(true),
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
