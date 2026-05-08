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
    if (nextState === state) {
      return;
    }
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

  it("adds devices with a generated id and preserves order", () => {
    const harness = createHarness();

    harness.commands.addDevice({
      type: "pc",
      name: "PC",
      floorId: floorA,
      position: { x: 100, y: 100 },
      size: { width: 20, height: 20 },
      metadata: {},
    });
    harness.commands.addDevice({
      type: "pc",
      name: "PC 2",
      floorId: floorA,
      position: { x: 140, y: 100 },
      size: { width: 20, height: 20 },
      metadata: {},
    });

    expect(harness.state.devices.map((d) => d.id)).toEqual([
      "device-1",
      "device-2",
    ]);
  });

  it("rejects updateDevicePosition when the new position collides", () => {
    const harness = createHarness({
      devices: [
        createDevice("device-a", { x: 0, y: 0 }),
        createDevice("device-b", { x: 100, y: 100 }),
      ],
    });

    harness.commands.updateDevicePosition("device-a", { x: 100, y: 100 });

    const movedDevice = harness.state.devices.find((d) => d.id === "device-a");
    expect(movedDevice?.position).toEqual({ x: 0, y: 0 });
  });

  it("ignores updateDevicePosition for unknown devices", () => {
    const harness = createHarness({
      devices: [createDevice("device-a", { x: 0, y: 0 })],
    });

    harness.commands.updateDevicePosition("missing", { x: 200, y: 200 });

    expect(harness.state.devices).toEqual([
      createDevice("device-a", { x: 0, y: 0 }),
    ]);
  });

  it("setCurrentBuilding switches to the first floor of the new building and clears selection", () => {
    const harness = createHarness({
      buildings: [
        {
          id: "building-a",
          name: "A",
          floors: [{ id: floorA, name: "A1" }],
        },
        {
          id: "building-b",
          name: "B",
          floors: [{ id: "floor-c", name: "B1" }],
        },
      ],
      selectedDeviceId: "device-a",
      highlightedDeviceIds: ["device-a"],
      highlightedDeviceIdSet: new Set(["device-a"]),
    });

    harness.commands.setCurrentBuilding("building-b");

    expect(harness.state.currentBuildingId).toBe("building-b");
    expect(harness.state.currentFloorId).toBe("floor-c");
    expect(harness.state.selectedDeviceId).toBe(null);
    expect(harness.state.highlightedDeviceIds).toEqual([]);
  });

  it("toggleEditMode resets the active draw tool when leaving edit mode", () => {
    const harness = createHarness({
      isEditMode: true,
      activeDrawTool: "wall",
    });

    harness.commands.toggleEditMode();

    expect(harness.state.isEditMode).toBe(false);
    expect(harness.state.activeDrawTool).toBe("device");
  });

  it("toggleEditMode keeps the active draw tool when entering edit mode", () => {
    const harness = createHarness({
      isEditMode: false,
      activeDrawTool: "wall",
    });

    harness.commands.toggleEditMode();

    expect(harness.state.isEditMode).toBe(true);
    expect(harness.state.activeDrawTool).toBe("wall");
  });

  it("addWallLine succeeds when the line stays clear of devices", () => {
    const harness = createHarness({
      devices: [createDevice("device-a", { x: 200, y: 200 })],
    });

    const result = harness.commands.addWallLine({
      floorId: floorA,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 70, y: 10 },
    });

    expect(result.changed).toBe(true);
    expect(result.reason).toBe("applied");
    expect(harness.state.walls.length).toBeGreaterThan(0);
    harness.state.walls.forEach((wall) => {
      expect(wall.id.startsWith("wall-")).toBe(true);
    });
  });

  it("selectDevice updates the selected id and short-circuits on no-op", () => {
    const harness = createHarness();

    harness.commands.selectDevice("device-a");
    expect(harness.state.selectedDeviceId).toBe("device-a");

    const before = harness.state;
    harness.commands.selectDevice("device-a");
    expect(harness.state).toBe(before);
  });

  it("setHoveredDevice updates the hovered id and short-circuits on no-op", () => {
    const harness = createHarness();

    harness.commands.setHoveredDevice("device-a");
    expect(harness.state.hoveredDeviceId).toBe("device-a");

    const before = harness.state;
    harness.commands.setHoveredDevice("device-a");
    expect(harness.state).toBe(before);
  });

  it("updateDevicePosition writes the new position when free", () => {
    const harness = createHarness({
      devices: [createDevice("device-a", { x: 0, y: 0 })],
    });

    harness.commands.updateDevicePosition("device-a", { x: 200, y: 200 });

    const moved = harness.state.devices.find((d) => d.id === "device-a");
    expect(moved?.position).toEqual({ x: 200, y: 200 });
  });

  it("addWallRoom builds a closed rectangle of walls", () => {
    const harness = createHarness();

    const result = harness.commands.addWallRoom({
      floorId: floorA,
      color: "concrete",
      start: { x: 0, y: 0 },
      end: { x: 80, y: 60 },
    });

    expect(result.changed).toBe(true);
    expect(result.reason).toBe("applied");
    expect(harness.state.walls.length).toBeGreaterThan(0);
  });

  it("eraseWallAtPointer removes a previously placed block", () => {
    const harness = createHarness();

    harness.commands.addWallLine({
      floorId: floorA,
      color: "concrete",
      start: { x: 0, y: 0 },
      end: { x: 60, y: 0 },
    });

    const placed = harness.state.walls.length;
    expect(placed).toBeGreaterThan(0);

    const target = harness.state.walls[0];
    const result = harness.commands.eraseWallAtPointer({
      floorId: floorA,
      pointer: target.start,
      snappedPoint: target.start,
    });

    expect(result.changed).toBe(true);
    expect(harness.state.walls.length).toBe(placed - 1);
  });

  it("eraseWallStroke wipes blocks along the stroke segment", () => {
    const harness = createHarness();

    harness.commands.addWallLine({
      floorId: floorA,
      color: "concrete",
      start: { x: 0, y: 0 },
      end: { x: 80, y: 0 },
    });
    expect(harness.state.walls.length).toBeGreaterThan(0);

    const result = harness.commands.eraseWallStroke({
      floorId: floorA,
      fromPointer: { x: 0, y: 0 },
      fromSnappedPoint: { x: 0, y: 0 },
      toPointer: { x: 80, y: 0 },
      toSnappedPoint: { x: 80, y: 0 },
    });

    expect(result.changed).toBe(true);
    expect(harness.state.walls).toEqual([]);
  });

  it("previewEraseWallAtPointer reports affected blocks without mutating walls", () => {
    const harness = createHarness();

    harness.commands.addWallLine({
      floorId: floorA,
      color: "concrete",
      start: { x: 0, y: 0 },
      end: { x: 60, y: 0 },
    });
    const before = harness.state.walls;

    const target = before[0];
    const preview = harness.commands.previewEraseWallAtPointer({
      floorId: floorA,
      pointer: target.start,
      snappedPoint: target.start,
    });

    expect(preview.changed).toBe(false);
    expect(preview.affectedKeys.length).toBeGreaterThan(0);
    expect(harness.state.walls).toBe(before);
  });

  it("setActiveDrawTool stores the chosen tool", () => {
    const harness = createHarness({ activeDrawTool: "device" });
    harness.commands.setActiveDrawTool("wall-erase");
    expect(harness.state.activeDrawTool).toBe("wall-erase");
  });

  it("setSelectedWallColor stores the chosen wall color", () => {
    const harness = createHarness({ selectedWallColor: "concrete" });
    harness.commands.setSelectedWallColor("slate");
    expect(harness.state.selectedWallColor).toBe("slate");
  });

  it("setHighlightedDevices updates the list and the lookup set", () => {
    const harness = createHarness();
    harness.commands.setHighlightedDevices(["a", "b"]);

    expect(harness.state.highlightedDeviceIds).toEqual(["a", "b"]);
    expect(harness.state.highlightedDeviceIdSet.has("a")).toBe(true);
    expect(harness.state.highlightedDeviceIdSet.has("b")).toBe(true);
  });

  it("setHighlightedDevices short-circuits when the list is unchanged", () => {
    const harness = createHarness({
      highlightedDeviceIds: ["a"],
      highlightedDeviceIdSet: new Set(["a"]),
    });

    const before = harness.state;
    harness.commands.setHighlightedDevices(["a"]);
    expect(harness.state).toBe(before);
  });

  it("checkCollision delegates to the shared collision check", () => {
    const harness = createHarness({
      devices: [createDevice("device-a", { x: 0, y: 0 })],
    });

    expect(
      harness.commands.checkCollision(
        floorA,
        "device-b",
        { x: 0, y: 0 },
        { width: 10, height: 10 },
      ),
    ).toBe(true);

    expect(
      harness.commands.checkCollision(
        floorA,
        "device-b",
        { x: 200, y: 200 },
        { width: 10, height: 10 },
      ),
    ).toBe(false);
  });
});
