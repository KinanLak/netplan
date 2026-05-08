import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, renderHook } from "@testing-library/react";
import type { WallSegment } from "@/types/map";
import { buildDevice, seedMapStore } from "../../test/storeHarness";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useDevices,
  useHighlightedDeviceIds,
  useIsDeviceHighlighted,
  useIsDeviceSelected,
  useIsEditMode,
  useSelectedDeviceId,
  useSelectedWallColor,
  useWalls,
} from "./selectors";

afterEach(() => {
  cleanup();
});

describe("map store selectors", () => {
  it("reads state and derived device flags from the map store", () => {
    const device = buildDevice({ id: "device-a" });
    const wall: WallSegment = {
      id: "wall-a",
      floorId: "floor-1",
      start: { x: 10, y: 10 },
      end: { x: 30, y: 10 },
      color: "slate",
    };

    seedMapStore({
      devices: [device],
      walls: [wall],
      currentFloorId: "floor-1",
      selectedDeviceId: "device-a",
      isEditMode: false,
      activeDrawTool: "wall",
      selectedWallColor: "slate",
      highlightedDeviceIds: ["device-a"],
      highlightedDeviceIdSet: new Set(["device-a"]),
    });

    expect(renderHook(() => useDevices()).result.current).toEqual([device]);
    expect(renderHook(() => useWalls()).result.current).toEqual([wall]);
    expect(renderHook(() => useCurrentFloorId()).result.current).toBe(
      "floor-1",
    );
    expect(renderHook(() => useSelectedDeviceId()).result.current).toBe(
      "device-a",
    );
    expect(renderHook(() => useIsEditMode()).result.current).toBe(false);
    expect(renderHook(() => useActiveDrawTool()).result.current).toBe("wall");
    expect(renderHook(() => useSelectedWallColor()).result.current).toBe(
      "slate",
    );
    expect(renderHook(() => useHighlightedDeviceIds()).result.current).toEqual([
      "device-a",
    ]);
    expect(
      renderHook(() => useIsDeviceSelected("device-a")).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useIsDeviceHighlighted("device-a")).result.current,
    ).toBe(true);
    expect(
      renderHook(() => useIsDeviceSelected("device-b")).result.current,
    ).toBe(false);
    expect(
      renderHook(() => useIsDeviceHighlighted("device-b")).result.current,
    ).toBe(false);
  });
});
