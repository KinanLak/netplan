import { describe, expect, it } from "bun:test";
import type { Device, MapStore, Position, Size } from "@/types/map";
import { createMapCommands } from "./mapCommands";

const floorA = "floor-a";
const floorB = "floor-b";

const createDevice = (
  id: string,
  position: Position,
  size: Size = { width: 20, height: 20 },
): Device => ({
  id,
  type: "pc",
  name: id,
  floorId: floorA,
  position,
  size,
  metadata: {},
});

const createHarness = (overrides: Partial<MapStore> = {}) => {
  let deviceIndex = 0;
  let wallIndex = 0;
  let state: MapStore;

  const set = (
    partial:
      | Partial<MapStore>
      | MapStore
      | ((currentState: MapStore) => Partial<MapStore> | MapStore),
  ) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    state = { ...state, ...nextState };
  };

  const commands = createMapCommands({
    set,
    get: () => state,
    generateDeviceId: () => `device-${++deviceIndex}`,
    generateWallId: () => `wall-${++wallIndex}`,
  });

  state = {
    buildings: [
      {
        id: "building-a",
        name: "Building A",
        floors: [
          { id: floorA, name: "Floor A" },
          { id: floorB, name: "Floor B" },
        ],
      },
    ],
    devices: [],
    walls: [],
    currentBuildingId: "building-a",
    currentFloorId: floorA,
    selectedDeviceId: null,
    hoveredDeviceId: null,
    isEditMode: true,
    highlightedDeviceIds: [],
    highlightedDeviceIdSet: new Set(),
    activeDrawTool: "device",
    selectedWallColor: "concrete",
    ...commands,
    ...overrides,
  };

  return {
    get state() {
      return state;
    },
    commands,
  };
};

describe("map commands", () => {
  it("deletes devices with selection and highlight cleanup", () => {
    const harness = createHarness({
      devices: [createDevice("device-a", { x: 0, y: 0 })],
      selectedDeviceId: "device-a",
      highlightedDeviceIds: ["device-a", "device-b"],
      highlightedDeviceIdSet: new Set(["device-a", "device-b"]),
    });

    harness.commands.deleteDevice("device-a");

    expect(harness.state.devices).toEqual([]);
    expect(harness.state.selectedDeviceId).toBe(null);
    expect(harness.state.highlightedDeviceIds).toEqual(["device-b"]);
    expect(harness.state.highlightedDeviceIdSet.has("device-a")).toBe(false);
    expect(harness.state.highlightedDeviceIdSet.has("device-b")).toBe(true);
  });

  it("rejects wall commands that collide with devices", () => {
    const harness = createHarness({
      devices: [createDevice("device-a", { x: 20, y: 0 })],
    });

    const result = harness.commands.addWallLine({
      floorId: floorA,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 50, y: 10 },
    });

    expect(result.changed).toBe(false);
    expect(result.reason).toBe("collision-with-device");
    expect(harness.state.walls).toEqual([]);
  });

  it("clears transient references when the floor changes", () => {
    const harness = createHarness({
      selectedDeviceId: "device-a",
      highlightedDeviceIds: ["device-a"],
      highlightedDeviceIdSet: new Set(["device-a"]),
    });

    harness.commands.setCurrentFloor(floorB);

    expect(harness.state.currentFloorId).toBe(floorB);
    expect(harness.state.selectedDeviceId).toBe(null);
    expect(harness.state.highlightedDeviceIds).toEqual([]);
    expect(harness.state.highlightedDeviceIdSet.size).toBe(0);
  });
});
