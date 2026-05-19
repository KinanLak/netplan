import { describe, expect, it } from "bun:test";
import type { FloorId } from "@/types/map";
import { createWallInteractionState } from "./state";
import { getWallInteractionViewModel } from "./viewModel";
import type { WallInteractionContext, WallInteractionState } from "./types";

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

const seedDrawing = (
  overrides: Partial<WallInteractionState> = {},
): WallInteractionState => ({
  ...createWallInteractionState(),
  ...overrides,
});

describe("wallInteraction view model", () => {
  it("strips pointer data when trackPointerPosition is false", () => {
    const state = seedDrawing({
      pointerPosition: { x: 10, y: 10 },
      pointerSnapPoint: { x: 20, y: 20 },
    });

    const vm = getWallInteractionViewModel(
      state,
      makeContext({ trackPointerPosition: false }),
    );

    expect(vm.pointerPosition).toBe(null);
    expect(vm.pointerSnapPoint).toBe(null);
  });

  it("keeps pointer data when trackPointerPosition is true", () => {
    const state = seedDrawing({
      pointerPosition: { x: 10, y: 10 },
      pointerSnapPoint: { x: 20, y: 20 },
    });

    const vm = getWallInteractionViewModel(state, makeContext());

    expect(vm.pointerPosition).toEqual({ x: 10, y: 10 });
    expect(vm.pointerSnapPoint).toEqual({ x: 20, y: 20 });
  });

  it("exposes the eraser pointer and size only for the erase tool", () => {
    const state = seedDrawing({
      pointerPosition: { x: 12, y: 18 },
    });

    const eraseVm = getWallInteractionViewModel(
      state,
      makeContext({ activeDrawTool: "wall-erase", wallEraserSize: 4 }),
    );
    const wallVm = getWallInteractionViewModel(state, makeContext());

    expect(eraseVm.erasePreviewPointer).toEqual({ x: 12, y: 18 });
    expect(eraseVm.wallEraserSize).toBe(4);
    expect(wallVm.erasePreviewPointer).toBe(null);
  });

  it("returns no preview segments for the device tool", () => {
    const state = seedDrawing({
      drawAnchor: { x: 0, y: 0 },
      pointerPreview: { x: 60, y: 0 },
    });

    const vm = getWallInteractionViewModel(
      state,
      makeContext({ activeDrawTool: "device" }),
    );

    expect(vm.previewSegments).toEqual([]);
  });

  it("returns wall draft blocks for the wall tool when both endpoints are known", () => {
    const state = seedDrawing({
      drawAnchor: { x: 0, y: 0 },
      pointerPreview: { x: 60, y: 0 },
    });

    const vm = getWallInteractionViewModel(state, makeContext());

    expect(vm.previewSegments.length).toBeGreaterThan(0);
  });

  it("returns room draft blocks for the room tool", () => {
    const state = seedDrawing({
      drawAnchor: { x: 0, y: 0 },
      pointerPreview: { x: 60, y: 60 },
    });

    const vm = getWallInteractionViewModel(
      state,
      makeContext({ activeDrawTool: "room" }),
    );

    expect(vm.previewSegments.length).toBeGreaterThan(0);
  });

  it("uses the default cursor outside edit mode", () => {
    const vm = getWallInteractionViewModel(
      seedDrawing(),
      makeContext({ isEditMode: false }),
    );
    expect(vm.paneCursorClass).toBe("canvas-cursor-default");
  });

  it("uses the default cursor when the device tool is active", () => {
    const vm = getWallInteractionViewModel(
      seedDrawing(),
      makeContext({ activeDrawTool: "device" }),
    );
    expect(vm.paneCursorClass).toBe("canvas-cursor-default");
  });

  it("uses the crosshair cursor for room/wall-brush/wall-erase tools", () => {
    for (const tool of ["room", "wall-brush", "wall-erase"] as const) {
      const vm = getWallInteractionViewModel(
        seedDrawing(),
        makeContext({ activeDrawTool: tool }),
      );
      expect(vm.paneCursorClass).toBe("wall-cursor-crosshair");
    }
  });

  it("uses the crosshair cursor when the wall draft is empty", () => {
    const vm = getWallInteractionViewModel(seedDrawing(), makeContext());
    expect(vm.paneCursorClass).toBe("wall-cursor-crosshair");
  });

  it("emits a directional cursor based on the dominant draft axis", () => {
    const east = getWallInteractionViewModel(
      seedDrawing({
        drawAnchor: { x: 0, y: 0 },
        pointerPreview: { x: 80, y: 10 },
      }),
      makeContext(),
    );
    expect(east.paneCursorClass).toBe("wall-cursor-e");

    const west = getWallInteractionViewModel(
      seedDrawing({
        drawAnchor: { x: 80, y: 0 },
        pointerPreview: { x: 0, y: 10 },
      }),
      makeContext(),
    );
    expect(west.paneCursorClass).toBe("wall-cursor-w");

    const south = getWallInteractionViewModel(
      seedDrawing({
        drawAnchor: { x: 0, y: 0 },
        pointerPreview: { x: 10, y: 80 },
      }),
      makeContext(),
    );
    expect(south.paneCursorClass).toBe("wall-cursor-s");

    const north = getWallInteractionViewModel(
      seedDrawing({
        drawAnchor: { x: 0, y: 80 },
        pointerPreview: { x: 10, y: 0 },
      }),
      makeContext(),
    );
    expect(north.paneCursorClass).toBe("wall-cursor-n");
  });

  it("falls back to crosshair when anchor and preview match", () => {
    const vm = getWallInteractionViewModel(
      seedDrawing({
        drawAnchor: { x: 10, y: 10 },
        pointerPreview: { x: 10, y: 10 },
      }),
      makeContext(),
    );
    expect(vm.paneCursorClass).toBe("wall-cursor-crosshair");
  });
});
