import { afterEach, describe, expect, it } from "bun:test";
import { buildDevice } from "../../test/storeHarness";
import { rehydrateMapStore, useMapStore } from "./useMapStore";

const initialState = useMapStore.getState();

afterEach(() => {
  window.localStorage.removeItem("netplan-temporal-v3");
  useMapStore.setState({
    devices: initialState.devices,
    walls: initialState.walls,
    currentBuildingId: initialState.currentBuildingId,
    currentFloorId: initialState.currentFloorId,
    selectedDeviceId: initialState.selectedDeviceId,
    hoveredDeviceId: initialState.hoveredDeviceId,
    isEditMode: initialState.isEditMode,
    highlightedDeviceIds: initialState.highlightedDeviceIds,
    highlightedDeviceIdSet: initialState.highlightedDeviceIdSet,
    activeDrawTool: initialState.activeDrawTool,
    selectedWallColor: initialState.selectedWallColor,
  });
});

describe("useMapStore", () => {
  it("uses generated ids when adding devices and walls through the store", () => {
    useMapStore.setState({ devices: [], walls: [] });

    useMapStore.getState().addDevice(
      buildDevice({
        id: "ignored",
        floorId: "floor-1",
        position: { x: 10_000, y: 10_000 },
      }),
    );
    const wallResult = useMapStore.getState().addWallLine({
      floorId: "floor-1",
      start: { x: 20_000, y: 20_000 },
      end: { x: 20_020, y: 20_000 },
      color: "concrete",
    });

    expect(useMapStore.getState().devices[0].id.startsWith("device-")).toBe(
      true,
    );
    expect(wallResult.changed).toBe(true);
    expect(useMapStore.getState().walls[0].id.startsWith("wall-")).toBe(true);
  });

  it("removes legacy temporal storage before rehydrating", async () => {
    window.localStorage.setItem("netplan-temporal-v3", "legacy");

    await rehydrateMapStore();

    expect(window.localStorage.getItem("netplan-temporal-v3")).toBe(null);
  });
});
