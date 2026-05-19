import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { DeviceId, FloorId } from "@/types/map";
import { seedMapStore } from "../../test/storeHarness";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useHighlightedDeviceIds,
  useIsDeviceHighlighted,
  useIsDeviceSelected,
  useIsEditMode,
  useSelectedDeviceId,
  useSelectedWallColor,
  useWallEraserSize,
} from "./selectors";
import { useMapStore } from "./useMapStore";

const did = (s: string) => s as DeviceId;
const fid = (s: string) => s as FloorId;

afterEach(() => {
  cleanup();
});

describe("map store selectors", () => {
  it("reads UI slices and derived device flags from the map store", () => {
    seedMapStore({
      currentFloorId: fid("floor-1"),
      selectedDeviceId: did("device-a"),
      isEditMode: false,
      activeDrawTool: "wall",
      selectedWallColor: "slate",
      wallEraserSize: 3,
      highlightedDeviceIds: [did("device-a")],
      highlightedDeviceIdSet: new Set([did("device-a")]),
    });

    expect(renderHook(() => useCurrentFloorId()).result.current).toBe(
      fid("floor-1"),
    );
    expect(renderHook(() => useSelectedDeviceId()).result.current).toBe(
      did("device-a"),
    );
    expect(renderHook(() => useIsEditMode()).result.current).toBe(false);
    expect(renderHook(() => useActiveDrawTool()).result.current).toBe("wall");
    expect(renderHook(() => useSelectedWallColor()).result.current).toBe(
      "slate",
    );
    expect(renderHook(() => useWallEraserSize()).result.current).toBe(3);
    expect(renderHook(() => useHighlightedDeviceIds()).result.current).toEqual([
      did("device-a"),
    ]);
    expect(
      renderHook(() => useIsDeviceSelected(did("device-a"))).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useIsDeviceHighlighted(did("device-a"))).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useIsDeviceSelected(did("device-b"))).result.current,
    ).toBe(false);
    expect(
      renderHook(() => useIsDeviceHighlighted(did("device-b"))).result.current,
    ).toBe(false);
  });

  it("clamps wall eraser size to the supported range", () => {
    const { setWallEraserSize } = useMapStore.getState();

    setWallEraserSize(9);
    expect(useMapStore.getState().wallEraserSize).toBe(5);

    setWallEraserSize(0);
    expect(useMapStore.getState().wallEraserSize).toBe(1);
  });
});
