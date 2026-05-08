import { describe, expect, it } from "bun:test";
import type { TemporalState } from "zundo";
import type { Device, MapStore, WallSegment } from "@/types/map";
import { UNDO_REDO_EVENT_NAME } from "@/lib/constants";
import type { MapHistorySnapshot } from "./mapHistory";
import {
  findAffectedFloorId,
  redoMapChange,
  undoMapChange,
} from "./mapHistory";

const floorA = "floor-a";
const floorB = "floor-b";

const createDevice = (id: string, floorId: string): Device => ({
  id,
  type: "pc",
  name: id,
  floorId,
  position: { x: 0, y: 0 },
  size: { width: 20, height: 20 },
  metadata: {},
});

const createWall = (id: string, floorId: string): WallSegment => ({
  id,
  floorId,
  start: { x: 10, y: 10 },
  end: { x: 10, y: 10 },
  color: "concrete",
});

const createTemporalState = ({
  pastStates = [],
  futureStates = [],
  undo = () => {},
  redo = () => {},
}: {
  pastStates?: Array<Partial<MapHistorySnapshot>>;
  futureStates?: Array<Partial<MapHistorySnapshot>>;
  undo?: () => void;
  redo?: () => void;
}): TemporalState<MapHistorySnapshot> => ({
  pastStates,
  futureStates,
  undo,
  redo,
  clear: () => {},
  isTracking: true,
  pause: () => {},
  resume: () => {},
  setOnSave: () => {},
});

const createStoreHarness = (overrides: Partial<MapStore> = {}) => {
  let state: MapStore;

  const setCurrentFloor = (floorId: string) => {
    state = {
      ...state,
      currentFloorId: floorId,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: new Set(),
    };
  };

  const selectDevice = (deviceId: string | null) => {
    state = { ...state, selectedDeviceId: deviceId };
  };

  const setHighlightedDevices = (deviceIds: Array<string>) => {
    state = {
      ...state,
      highlightedDeviceIds: deviceIds,
      highlightedDeviceIdSet: new Set(deviceIds),
    };
  };

  state = {
    buildings: [],
    devices: [],
    walls: [],
    currentBuildingId: null,
    currentFloorId: floorA,
    selectedDeviceId: null,
    hoveredDeviceId: null,
    isEditMode: true,
    highlightedDeviceIds: [],
    highlightedDeviceIdSet: new Set(),
    activeDrawTool: "device",
    selectedWallColor: "concrete",
    setCurrentBuilding: () => {},
    setCurrentFloor,
    selectDevice,
    setHoveredDevice: () => {},
    addDevice: () => {},
    updateDevicePosition: () => {},
    deleteDevice: () => {},
    addWallLine: () => ({
      changed: false,
      nextWalls: state.walls,
      affectedKeys: [],
      reason: "invalid-line",
    }),
    addWallRoom: () => ({
      changed: false,
      nextWalls: state.walls,
      affectedKeys: [],
      reason: "invalid-room",
    }),
    eraseWallAtPointer: () => ({
      changed: false,
      nextWalls: state.walls,
      affectedKeys: [],
      reason: "no-wall-at-pointer",
    }),
    eraseWallStroke: () => ({
      changed: false,
      nextWalls: state.walls,
      affectedKeys: [],
      reason: "empty-stroke",
    }),
    previewEraseWallAtPointer: () => ({
      changed: false,
      nextWalls: state.walls,
      affectedKeys: [],
      reason: "preview-miss",
    }),
    toggleEditMode: () => {},
    setActiveDrawTool: () => {},
    setSelectedWallColor: () => {},
    setHighlightedDevices,
    checkCollision: () => false,
    ...overrides,
  };

  return {
    get state() {
      return state;
    },
    replaceHistorySnapshot(snapshot: MapHistorySnapshot) {
      state = {
        ...state,
        devices: snapshot.devices,
        walls: snapshot.walls,
      };
    },
    store: {
      getState: () => state,
      temporal: {
        getState: () =>
          createTemporalState({
            pastStates: [],
            futureStates: [],
          }),
      },
    },
  };
};

const installTestWindow = () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const testWindow = new EventTarget();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: testWindow,
  });

  return () => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
      return;
    }

    Reflect.deleteProperty(globalThis, "window");
  };
};

describe("map history", () => {
  it("finds the affected floor across device and wall changes", () => {
    const deviceA = createDevice("device-a", floorA);
    const deviceB = createDevice("device-b", floorB);
    const movedDeviceB = {
      ...deviceB,
      position: { x: 20, y: 20 },
    };
    const wallA = createWall("wall-a", floorA);
    const wallB = createWall("wall-b", floorB);
    const movedWallB = {
      ...wallB,
      end: { x: 30, y: 10 },
    };

    expect(
      findAffectedFloorId(
        { devices: [deviceA], walls: [] },
        { devices: [deviceA, deviceB], walls: [] },
      ),
    ).toBe(floorB);
    expect(
      findAffectedFloorId(
        { devices: [deviceA, deviceB], walls: [] },
        { devices: [deviceA, movedDeviceB], walls: [] },
      ),
    ).toBe(floorB);
    expect(
      findAffectedFloorId(
        { devices: [deviceA, deviceB], walls: [] },
        { devices: [deviceA], walls: [] },
      ),
    ).toBe(floorB);
    expect(
      findAffectedFloorId(
        { devices: [deviceA], walls: [wallA] },
        { devices: [deviceA], walls: [wallA, wallB] },
      ),
    ).toBe(floorB);
    expect(
      findAffectedFloorId(
        { devices: [deviceA], walls: [wallA, wallB] },
        { devices: [deviceA], walls: [wallA] },
      ),
    ).toBe(floorB);
    expect(
      findAffectedFloorId(
        { devices: [deviceA], walls: [wallA, wallB] },
        { devices: [deviceA], walls: [wallA, movedWallB] },
      ),
    ).toBe(floorB);
    expect(
      findAffectedFloorId(
        { devices: [deviceA], walls: [wallA] },
        { devices: [deviceA], walls: [wallA] },
      ),
    ).toBe(null);
  });

  it("ignores history commands outside edit mode", () => {
    let undoCount = 0;
    const harness = createStoreHarness({ isEditMode: false });

    harness.store.temporal.getState = () =>
      createTemporalState({
        pastStates: [{ devices: [], walls: [] }],
        undo: () => {
          undoCount += 1;
        },
      });

    undoMapChange(harness.store);

    expect(undoCount).toBe(0);
  });

  it("ignores history commands when there is no matching history entry", () => {
    let redoCount = 0;
    const harness = createStoreHarness();

    harness.store.temporal.getState = () =>
      createTemporalState({
        futureStates: [],
        redo: () => {
          redoCount += 1;
        },
      });

    redoMapChange(harness.store);

    expect(redoCount).toBe(0);
  });

  it("undo navigates to the affected floor and dispatches feedback", () => {
    const deviceA = createDevice("device-a", floorA);
    const removedDevice = createDevice("device-b", floorB);
    const harness = createStoreHarness({
      devices: [deviceA, removedDevice],
      selectedDeviceId: removedDevice.id,
      currentFloorId: floorA,
    });
    const undoSnapshot = { devices: [deviceA], walls: [] };
    let eventType: string | null = null;
    const onHistoryEvent = (event: Event) => {
      eventType = (event as CustomEvent<{ type: string }>).detail.type;
    };

    harness.store.temporal.getState = () =>
      createTemporalState({
        pastStates: [undoSnapshot],
        futureStates: [],
        undo: () => harness.replaceHistorySnapshot(undoSnapshot),
      });

    const uninstallTestWindow = installTestWindow();
    try {
      window.addEventListener(UNDO_REDO_EVENT_NAME, onHistoryEvent);
      undoMapChange(harness.store);
      window.removeEventListener(UNDO_REDO_EVENT_NAME, onHistoryEvent);
    } finally {
      uninstallTestWindow();
    }

    expect(harness.state.devices).toEqual([deviceA]);
    expect(harness.state.currentFloorId).toBe(floorB);
    expect(harness.state.selectedDeviceId).toBe(null);
    expect(eventType).toBe("undo");
  });

  it("redo cleans stale selected and highlighted device references", () => {
    const deviceA = createDevice("device-a", floorA);
    const harness = createStoreHarness({
      devices: [deviceA],
      selectedDeviceId: "missing-device",
      highlightedDeviceIds: [deviceA.id, "missing-device"],
      highlightedDeviceIdSet: new Set([deviceA.id, "missing-device"]),
    });
    const redoSnapshot = { devices: [deviceA], walls: [] };

    harness.store.temporal.getState = () =>
      createTemporalState({
        pastStates: [],
        futureStates: [redoSnapshot],
        redo: () => harness.replaceHistorySnapshot(redoSnapshot),
      });

    redoMapChange(harness.store);

    expect(harness.state.selectedDeviceId).toBe(null);
    expect(harness.state.highlightedDeviceIds).toEqual([deviceA.id]);
    expect(harness.state.highlightedDeviceIdSet.has(deviceA.id)).toBe(true);
    expect(harness.state.highlightedDeviceIdSet.has("missing-device")).toBe(
      false,
    );
  });
});
