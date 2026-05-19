import { describe, expect, it, mock } from "bun:test";
import {
  cancelWallTool,
  createWallInteractionState,
  releaseWallPointer,
  resetWallInteractionState,
  suppressWallContextMenu,
} from "./state";
import type { FloorId } from "@/types/map";
import type {
  WallInteractionAdapter,
  WallInteractionContext,
  WallInteractionState,
} from "./types";

const makeContext = (
  overrides: Partial<WallInteractionContext> = {},
): WallInteractionContext => ({
  isEditMode: true,
  activeDrawTool: "wall",
  currentFloorId: "floor-1" as FloorId,
  selectedWallColor: "concrete",
  wallEraserSize: 1,
  trackPointerPosition: true,
  ...overrides,
});

describe("wallInteraction state", () => {
  it("creates a clean draft state", () => {
    const state = createWallInteractionState();
    expect(state.drawAnchor).toBe(null);
    expect(state.erasePreviewKeys).toEqual([]);
    expect(state.isEraseStrokeActive).toBe(false);
    expect(state.isBrushStrokeActive).toBe(false);
  });

  it("resetWallInteractionState returns a fresh state", () => {
    const reset = resetWallInteractionState();
    expect(reset).toEqual(createWallInteractionState());
  });

  it("releaseWallPointer is a no-op for non stroke tools", () => {
    const state: WallInteractionState = {
      ...createWallInteractionState(),
      isEraseStrokeActive: true,
    };
    const next = releaseWallPointer(
      state,
      makeContext({ activeDrawTool: "wall" }),
    );
    expect(next).toBe(state);
  });

  it("releaseWallPointer clears stroke fields for wall-erase", () => {
    const state: WallInteractionState = {
      ...createWallInteractionState(),
      isEraseStrokeActive: true,
      eraseStrokeLastSample: {
        pointer: { x: 0, y: 0 },
        snappedPoint: { x: 0, y: 0 },
      },
    };
    const next = releaseWallPointer(
      state,
      makeContext({ activeDrawTool: "wall-erase" }),
    );
    expect(next.isEraseStrokeActive).toBe(false);
    expect(next.eraseStrokeLastSample).toBe(null);
  });

  it("cancelWallTool resets the active draw tool to device", () => {
    const adapter: Pick<WallInteractionAdapter, "setActiveDrawTool"> = {
      setActiveDrawTool: mock(() => {}),
    };

    const next = cancelWallTool(adapter);

    expect(adapter.setActiveDrawTool).toHaveBeenCalledTimes(1);
    expect(adapter.setActiveDrawTool).toHaveBeenCalledWith("device");
    expect(next).toEqual(createWallInteractionState());
  });

  it("suppressWallContextMenu is unhandled outside edit mode", () => {
    const adapter: Pick<WallInteractionAdapter, "setActiveDrawTool"> = {
      setActiveDrawTool: mock(() => {}),
    };
    const state = createWallInteractionState();

    const result = suppressWallContextMenu(
      state,
      makeContext({ isEditMode: false }),
    );

    expect(result.handled).toBe(false);
    expect(result.state).toBe(state);
    expect(adapter.setActiveDrawTool).toHaveBeenCalledTimes(0);
  });

  it("suppressWallContextMenu is unhandled when the device tool is active", () => {
    const adapter: Pick<WallInteractionAdapter, "setActiveDrawTool"> = {
      setActiveDrawTool: mock(() => {}),
    };
    const state = createWallInteractionState();

    const result = suppressWallContextMenu(
      state,
      makeContext({ activeDrawTool: "device" }),
    );

    expect(result.handled).toBe(false);
    expect(adapter.setActiveDrawTool).toHaveBeenCalledTimes(0);
  });

  it("suppressWallContextMenu keeps the active wall tool", () => {
    const adapter: Pick<WallInteractionAdapter, "setActiveDrawTool"> = {
      setActiveDrawTool: mock(() => {}),
    };
    const state: WallInteractionState = {
      ...createWallInteractionState(),
      drawAnchor: { x: 10, y: 10 },
    };

    const result = suppressWallContextMenu(
      state,
      makeContext({ activeDrawTool: "wall" }),
    );

    expect(result.handled).toBe(true);
    expect(result.state).toBe(state);
    expect(adapter.setActiveDrawTool).toHaveBeenCalledTimes(0);
  });
});
