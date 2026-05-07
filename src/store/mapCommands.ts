import type {
  Device,
  MapActions,
  MapStore,
  Position,
  Size,
  WallCommandResult,
  WallSegment,
} from "@/types/map";
import { rectanglesOverlap } from "@/lib/geometry";
import {
  getWallCollisionRect,
  wallCollidesWithDevices,
} from "@/walls/gridGeometry";
import {
  addLine,
  addRoom,
  eraseAtPointer,
  eraseStroke,
  previewEraseAtPointer,
} from "@/walls/engine";

type SetMapStore = (
  partial:
    | Partial<MapStore>
    | MapStore
    | ((state: MapStore) => Partial<MapStore> | MapStore),
) => void;

type GetMapStore = () => MapStore;

interface CreateMapCommandsOptions {
  set: SetMapStore;
  get: GetMapStore;
  generateDeviceId: () => string;
  generateWallId: () => string;
}

type CollisionState = Pick<MapStore, "devices" | "walls">;

interface FloorCollisionCache {
  floorId: string;
  devicesRef: Array<Device>;
  wallsRef: Array<WallSegment>;
  floorDevices: Array<Pick<Device, "id" | "position" | "size">>;
  floorWallRects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

let floorCollisionCache: FloorCollisionCache | null = null;

export const toHighlightedDeviceIdSet = (
  deviceIds: ReadonlyArray<string>,
): ReadonlySet<string> => new Set(deviceIds);

const getFloorCollisionCache = (
  state: CollisionState,
  floorId: string | null,
): FloorCollisionCache | null => {
  if (!floorId) {
    return null;
  }

  if (
    floorCollisionCache &&
    floorCollisionCache.floorId === floorId &&
    floorCollisionCache.devicesRef === state.devices &&
    floorCollisionCache.wallsRef === state.walls
  ) {
    return floorCollisionCache;
  }

  const floorDevices: Array<Pick<Device, "id" | "position" | "size">> = [];
  for (const device of state.devices) {
    if (device.floorId === floorId) {
      floorDevices.push(device);
    }
  }

  const floorWallRects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  for (const wall of state.walls) {
    if (wall.floorId !== floorId) {
      continue;
    }

    floorWallRects.push(getWallCollisionRect(wall));
  }

  floorCollisionCache = {
    floorId,
    devicesRef: state.devices,
    wallsRef: state.walls,
    floorDevices,
    floorWallRects,
  };

  return floorCollisionCache;
};

export const checkMapCollision = (
  state: CollisionState,
  floorId: string | null,
  deviceId: string,
  position: Position,
  size: Size,
): boolean => {
  const collisionCache = getFloorCollisionCache(state, floorId);

  if (!collisionCache) {
    return false;
  }

  for (const otherDevice of collisionCache.floorDevices) {
    if (otherDevice.id === deviceId) {
      continue;
    }

    if (
      rectanglesOverlap(position, size, otherDevice.position, otherDevice.size)
    ) {
      return true;
    }
  }

  for (const wallRect of collisionCache.floorWallRects) {
    if (
      rectanglesOverlap(
        position,
        size,
        { x: wallRect.x, y: wallRect.y },
        { width: wallRect.width, height: wallRect.height },
      )
    ) {
      return true;
    }
  }

  return false;
};

const applyWallCommand = (
  result: WallCommandResult,
  setWalls: (nextWalls: Array<WallSegment>) => void,
): WallCommandResult => {
  if (result.changed) {
    setWalls(result.nextWalls);
  }

  return result;
};

const createDevice = (
  deviceData: Omit<Device, "id">,
  generateDeviceId: () => string,
): Device => ({
  ...deviceData,
  id: generateDeviceId(),
});

export const createMapCommands = ({
  set,
  get,
  generateDeviceId,
  generateWallId,
}: CreateMapCommandsOptions): MapActions => ({
  setCurrentBuilding: (buildingId) => {
    const building = get().buildings.find((b) => b.id === buildingId);
    set({
      currentBuildingId: buildingId,
      currentFloorId: building?.floors[0]?.id ?? null,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    });
  },

  setCurrentFloor: (floorId) => {
    set({
      currentFloorId: floorId,
      selectedDeviceId: null,
      highlightedDeviceIds: [],
      highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
    });
  },

  selectDevice: (deviceId) => {
    set((state) =>
      state.selectedDeviceId === deviceId
        ? state
        : { selectedDeviceId: deviceId },
    );
  },

  setHoveredDevice: (deviceId) => {
    set((state) =>
      state.hoveredDeviceId === deviceId
        ? state
        : { hoveredDeviceId: deviceId },
    );
  },

  addDevice: (deviceData) => {
    const newDevice = createDevice(deviceData, generateDeviceId);

    set((state) => ({
      devices: [...state.devices, newDevice],
    }));
  },

  updateDevicePosition: (deviceId, position) => {
    const state = get();
    const device = state.devices.find((d) => d.id === deviceId);
    if (!device) {
      return;
    }

    const hasCollision = checkMapCollision(
      state,
      device.floorId,
      deviceId,
      position,
      device.size,
    );
    if (hasCollision) {
      return;
    }

    set((currentState) => ({
      devices: currentState.devices.map((d) =>
        d.id === deviceId ? { ...d, position } : d,
      ),
    }));
  },

  deleteDevice: (deviceId) => {
    set((state) => {
      const highlightedDeviceIds = state.highlightedDeviceIds.filter(
        (id) => id !== deviceId,
      );

      return {
        devices: state.devices.filter((d) => d.id !== deviceId),
        selectedDeviceId:
          state.selectedDeviceId === deviceId ? null : state.selectedDeviceId,
        highlightedDeviceIds,
        highlightedDeviceIdSet: toHighlightedDeviceIdSet(highlightedDeviceIds),
      };
    });
  },

  addWallLine: (line) => {
    const state = get();
    const floorDevices = state.devices.filter(
      (device) => device.floorId === line.floorId,
    );

    const result = addLine({
      walls: state.walls,
      floorId: line.floorId,
      color: line.color,
      start: line.start,
      end: line.end,
      generateWallId,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevices),
    });

    return applyWallCommand(result, (nextWalls) => {
      set({ walls: nextWalls });
    });
  },

  addWallRoom: (room) => {
    const state = get();
    const floorDevices = state.devices.filter(
      (device) => device.floorId === room.floorId,
    );

    const result = addRoom({
      walls: state.walls,
      floorId: room.floorId,
      color: room.color,
      start: room.start,
      end: room.end,
      generateWallId,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevices),
    });

    return applyWallCommand(result, (nextWalls) => {
      set({ walls: nextWalls });
    });
  },

  eraseWallAtPointer: (input) => {
    const state = get();

    const result = eraseAtPointer({
      walls: state.walls,
      floorId: input.floorId,
      pointer: input.pointer,
      snappedPoint: input.snappedPoint,
    });

    return applyWallCommand(result, (nextWalls) => {
      set({ walls: nextWalls });
    });
  },

  eraseWallStroke: (input) => {
    const state = get();

    const result = eraseStroke({
      walls: state.walls,
      floorId: input.floorId,
      fromPointer: input.fromPointer,
      fromSnappedPoint: input.fromSnappedPoint,
      toPointer: input.toPointer,
      toSnappedPoint: input.toSnappedPoint,
    });

    return applyWallCommand(result, (nextWalls) => {
      set({ walls: nextWalls });
    });
  },

  previewEraseWallAtPointer: (input) => {
    const state = get();

    return previewEraseAtPointer({
      walls: state.walls,
      floorId: input.floorId,
      pointer: input.pointer,
      snappedPoint: input.snappedPoint,
    });
  },

  toggleEditMode: () => {
    set((state) => ({
      isEditMode: !state.isEditMode,
      activeDrawTool: state.isEditMode ? "device" : state.activeDrawTool,
    }));
  },

  setActiveDrawTool: (tool) => {
    set({ activeDrawTool: tool });
  },

  setSelectedWallColor: (color) => {
    set({ selectedWallColor: color });
  },

  setHighlightedDevices: (deviceIds) => {
    set((state) => {
      const isSameHighlightState =
        state.highlightedDeviceIds.length === deviceIds.length &&
        state.highlightedDeviceIds.every(
          (deviceId, index) => deviceId === deviceIds[index],
        );

      if (isSameHighlightState) {
        return state;
      }

      return {
        highlightedDeviceIds: deviceIds,
        highlightedDeviceIdSet: toHighlightedDeviceIdSet(deviceIds),
      };
    });
  },

  checkCollision: (floorId, deviceId, position, size) => {
    const state = get();
    return checkMapCollision(state, floorId, deviceId, position, size);
  },
});
