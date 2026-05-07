import { describe, expect, it } from "bun:test";
import type { MapStore } from "@/types/map";
import {
  areMapHistorySnapshotsEqual,
  migrateMapState,
  normalizeActiveDrawTool,
  partializeMapHistory,
  partializePersistedMapState,
} from "./mapPersistence";

const createMapStoreState = (overrides: Partial<MapStore> = {}): MapStore => ({
  buildings: [],
  devices: [],
  walls: [],
  currentBuildingId: "building-a",
  currentFloorId: "floor-a",
  selectedDeviceId: "device-a",
  hoveredDeviceId: "device-b",
  isEditMode: true,
  highlightedDeviceIds: ["device-a"],
  highlightedDeviceIdSet: new Set(["device-a"]),
  activeDrawTool: "wall",
  selectedWallColor: "sand",
  setCurrentBuilding: () => {},
  setCurrentFloor: () => {},
  selectDevice: () => {},
  setHoveredDevice: () => {},
  addDevice: () => {},
  updateDevicePosition: () => {},
  deleteDevice: () => {},
  addWallLine: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "invalid-line",
  }),
  addWallRoom: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "invalid-room",
  }),
  eraseWallAtPointer: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "no-wall-at-pointer",
  }),
  eraseWallStroke: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "empty-stroke",
  }),
  previewEraseWallAtPointer: () => ({
    changed: false,
    nextWalls: [],
    affectedKeys: [],
    reason: "preview-miss",
  }),
  toggleEditMode: () => {},
  setActiveDrawTool: () => {},
  setSelectedWallColor: () => {},
  setHighlightedDevices: () => {},
  checkCollision: () => false,
  ...overrides,
});

describe("map persistence", () => {
  it("normalizes invalid active draw tools", () => {
    expect(normalizeActiveDrawTool("room")).toBe("room");
    expect(normalizeActiveDrawTool("invalid")).toBe("device");
    expect(normalizeActiveDrawTool(undefined)).toBe("device");
  });

  it("migrates persisted map state", () => {
    const migrated = migrateMapState(
      {
        walls: [
          {
            id: "wall-a",
            floorId: "floor-a",
            start: { x: 10, y: 10 },
            end: { x: 10, y: 10 },
            color: "concrete",
          },
        ],
        activeDrawTool: "missing-tool",
      },
      2,
    );

    expect(migrated).toEqual({
      walls: [],
      activeDrawTool: "device",
    });
  });

  it("persists durable map state plus edit preferences", () => {
    const state = createMapStoreState();

    expect(partializePersistedMapState(state)).toEqual({
      devices: state.devices,
      walls: state.walls,
      currentBuildingId: "building-a",
      currentFloorId: "floor-a",
      isEditMode: true,
      activeDrawTool: "wall",
      selectedWallColor: "sand",
    });
  });

  it("uses devices and walls as the map history test surface", () => {
    const state = createMapStoreState();
    const snapshot = partializeMapHistory(state);

    expect(snapshot).toEqual({ devices: state.devices, walls: state.walls });
    expect(areMapHistorySnapshotsEqual(snapshot, snapshot)).toBe(true);
    expect(
      areMapHistorySnapshotsEqual(snapshot, { ...snapshot, walls: [] }),
    ).toBe(false);
  });
});
