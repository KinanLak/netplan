import { beforeEach, describe, expect, it } from "bun:test";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceId, FloorId, OverlayFileId } from "@/types/map";

const initialState = useMapStore.getState();
const did = (s: string) => s as DeviceId;

describe("calque panel state", () => {
  beforeEach(() => {
    useMapStore.setState(initialState, true);
  });

  it("opening the panel leaves wall tools, multi-select and selection", () => {
    const store = useMapStore.getState();
    store.toggleMultiSelectMode();
    store.setSelectedDevices([did("a"), did("b")]);
    store.setOverlayPanelOpen(true);

    const state = useMapStore.getState();
    expect(state.isOverlayPanelOpen).toBe(true);
    expect(state.isMultiSelectMode).toBe(false);
    expect(state.activeDrawTool).toBe("device");
    expect(state.selectedDeviceIds).toEqual([]);
  });

  it("closes when another mode takes the canvas", () => {
    const leave: Array<() => void> = [
      () => useMapStore.getState().setActiveDrawTool("wall"),
      () => useMapStore.getState().toggleMultiSelectMode(),
      () => useMapStore.getState().toggleEditMode(),
      () => useMapStore.getState().selectDevice(did("a")),
    ];
    for (const action of leave) {
      useMapStore.getState().setOverlayPanelOpen(true);
      action();
      expect(useMapStore.getState().isOverlayPanelOpen).toBe(false);
    }
  });

  it("stays open when the selection is only cleared", () => {
    useMapStore.getState().setOverlayPanelOpen(true);
    useMapStore.getState().setActiveDrawTool("device");
    useMapStore.getState().selectDevice(null);
    expect(useMapStore.getState().isOverlayPanelOpen).toBe(true);
  });

  it("hiding the calque is independent of edit mode", () => {
    useMapStore.getState().toggleOverlayHidden();
    useMapStore.getState().toggleEditMode();
    expect(useMapStore.getState().isOverlayHidden).toBe(true);
    useMapStore.getState().toggleOverlayHidden();
    expect(useMapStore.getState().isOverlayHidden).toBe(false);
  });

  it("a gesture's preview does not follow the user to another floor", () => {
    useMapStore.getState().setOverlayDraft({ rotation: 45 });
    useMapStore.getState().setCurrentFloor("floor:b" as FloorId);
    expect(useMapStore.getState().overlayDraft).toBeNull();
  });

  it("a calibration does not follow the user to another floor", () => {
    useMapStore.getState().setOverlayCalibration({
      fileId: "overlay-file:a" as OverlayFileId,
      points: [{ x: 1, y: 2 }],
    });
    useMapStore.getState().setCurrentFloor("floor:b" as FloorId);
    expect(useMapStore.getState().overlayCalibration).toBeNull();
  });
});

describe("placing panel state", () => {
  beforeEach(() => {
    useMapStore.setState(initialState, true);
  });

  it("takes the right edge from the calque panel, and gives it back", () => {
    useMapStore.getState().setOverlayPanelOpen(true);
    useMapStore.getState().setPlacePanelOpen(true);
    expect(useMapStore.getState().isOverlayPanelOpen).toBe(false);
    expect(useMapStore.getState().isPlacePanelOpen).toBe(true);

    useMapStore.getState().setOverlayPanelOpen(true);
    expect(useMapStore.getState().isPlacePanelOpen).toBe(false);
  });

  it("closes when another mode takes the canvas, not when a device is placed", () => {
    const leave: Array<() => void> = [
      () => useMapStore.getState().setActiveDrawTool("room"),
      () => useMapStore.getState().toggleMultiSelectMode(),
      () => useMapStore.getState().toggleEditMode(),
      () => useMapStore.getState().selectDevice(did("a")),
    ];
    for (const action of leave) {
      useMapStore.getState().setPlacePanelOpen(true);
      action();
      expect(useMapStore.getState().isPlacePanelOpen).toBe(false);
    }
    useMapStore.getState().setPlacePanelOpen(true);
    useMapStore.getState().selectDevice(null);
    expect(useMapStore.getState().isPlacePanelOpen).toBe(true);
  });
});

describe("text tool state", () => {
  beforeEach(() => {
    useMapStore.setState(initialState, true);
  });

  it("gives way to either panel, and takes over from both", () => {
    for (const open of [
      () => useMapStore.getState().setPlacePanelOpen(true),
      () => useMapStore.getState().setOverlayPanelOpen(true),
    ]) {
      useMapStore.getState().setLabelToolActive(true);
      open();
      expect(useMapStore.getState().isLabelToolActive).toBe(false);
    }
    useMapStore.getState().setLabelToolActive(true);
    expect(useMapStore.getState().isPlacePanelOpen).toBe(false);
    expect(useMapStore.getState().isOverlayPanelOpen).toBe(false);
  });
});
