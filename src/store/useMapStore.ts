import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import type {
  Device,
  MapStore,
  Position,
  Size,
  WallCommandResult,
  WallDraft,
  WallSegment,
} from "@/types/map";
import { mockBuildings } from "@/mock/buildings";
import { mockDevices } from "@/mock/devices";
import { getWallRect } from "@/lib/walls";
import { rectanglesOverlap, wallCollidesWithDevices } from "@/lib/geometry";
import {
  addLine,
  addRoom,
  eraseAtPointer,
  eraseStroke,
  previewEraseAtPointer,
} from "@/walls/engine";

const generateDeviceId = () =>
  `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const generateWallId = () =>
  `wall-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeActiveDrawTool = (tool: unknown): MapStore["activeDrawTool"] => {
  if (
    tool === "device" ||
    tool === "wall" ||
    tool === "wall-brush" ||
    tool === "wall-erase" ||
    tool === "room"
  ) {
    return tool;
  }

  return "device";
};

const toHighlightedDeviceIdSet = (
  deviceIds: ReadonlyArray<string>,
): ReadonlySet<string> => new Set(deviceIds);

type CollisionState = Pick<MapStore, "currentFloorId" | "devices" | "walls">;

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

const getFloorCollisionCache = (
  state: CollisionState,
): FloorCollisionCache | null => {
  if (!state.currentFloorId) {
    return null;
  }

  if (
    floorCollisionCache &&
    floorCollisionCache.floorId === state.currentFloorId &&
    floorCollisionCache.devicesRef === state.devices &&
    floorCollisionCache.wallsRef === state.walls
  ) {
    return floorCollisionCache;
  }

  const floorDevices: Array<Pick<Device, "id" | "position" | "size">> = [];
  for (const device of state.devices) {
    if (device.floorId === state.currentFloorId) {
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
    if (wall.floorId !== state.currentFloorId) {
      continue;
    }

    floorWallRects.push(getWallRect(wall));
  }

  floorCollisionCache = {
    floorId: state.currentFloorId,
    devicesRef: state.devices,
    wallsRef: state.walls,
    floorDevices,
    floorWallRects,
  };

  return floorCollisionCache;
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

export const useMapStore = create<MapStore>()(
  persist(
    temporal(
      (set, get) => ({
        buildings: mockBuildings,
        devices: mockDevices,
        walls: [],
        currentBuildingId: mockBuildings[0]?.id ?? null,
        currentFloorId: mockBuildings[0]?.floors[0]?.id ?? null,
        selectedDeviceId: null,
        hoveredDeviceId: null,
        isEditMode: true,
        highlightedDeviceIds: [],
        highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
        activeDrawTool: "device",
        selectedWallColor: "concrete",

        setCurrentBuilding: (buildingId: string) => {
          const building = get().buildings.find((b) => b.id === buildingId);
          set({
            currentBuildingId: buildingId,
            currentFloorId: building?.floors[0]?.id ?? null,
            selectedDeviceId: null,
            highlightedDeviceIds: [],
            highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
          });
        },

        setCurrentFloor: (floorId: string) => {
          set({
            currentFloorId: floorId,
            selectedDeviceId: null,
            highlightedDeviceIds: [],
            highlightedDeviceIdSet: toHighlightedDeviceIdSet([]),
          });
        },

        selectDevice: (deviceId: string | null) => {
          set((state) =>
            state.selectedDeviceId === deviceId
              ? state
              : { selectedDeviceId: deviceId },
          );
        },

        setHoveredDevice: (deviceId: string | null) => {
          set((state) =>
            state.hoveredDeviceId === deviceId
              ? state
              : { hoveredDeviceId: deviceId },
          );
        },

        addDevice: (deviceData: Omit<Device, "id">) => {
          const newDevice: Device = {
            ...deviceData,
            id: generateDeviceId(),
          };

          set((state) => ({
            devices: [...state.devices, newDevice],
          }));
        },

        updateDevicePosition: (deviceId: string, position: Position) => {
          const state = get();
          const device = state.devices.find((d) => d.id === deviceId);
          if (!device) {
            return;
          }

          const hasCollision = state.checkCollision(
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

        deleteDevice: (deviceId: string) => {
          set((state) => {
            const highlightedDeviceIds = state.highlightedDeviceIds.filter(
              (id) => id !== deviceId,
            );

            return {
              devices: state.devices.filter((d) => d.id !== deviceId),
              selectedDeviceId:
                state.selectedDeviceId === deviceId
                  ? null
                  : state.selectedDeviceId,
              highlightedDeviceIds,
              highlightedDeviceIdSet:
                toHighlightedDeviceIdSet(highlightedDeviceIds),
            };
          });
        },

        addWallLine: (line: WallDraft) => {
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

        setHighlightedDevices: (deviceIds: Array<string>) => {
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

        checkCollision: (deviceId: string, position: Position, size: Size) => {
          const state = get();
          const collisionCache = getFloorCollisionCache(state);

          if (!collisionCache) {
            return false;
          }

          for (const otherDevice of collisionCache.floorDevices) {
            if (otherDevice.id === deviceId) {
              continue;
            }

            if (
              rectanglesOverlap(
                position,
                size,
                otherDevice.position,
                otherDevice.size,
              )
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
        },
      }),
      {
        partialize: (state) => ({
          devices: state.devices,
          walls: state.walls,
        }),
        equality: (pastState, currentState) =>
          pastState.devices === currentState.devices &&
          pastState.walls === currentState.walls,
        limit: 100,
        wrapTemporal: (storeInitializer) =>
          persist(storeInitializer, {
            name: "netplan-temporal-v3",
            skipHydration: true,
          }),
      },
    ),
    {
      name: "netplan-storage",
      version: 3,
      skipHydration: true,
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }

        const typedState = persistedState as Partial<MapStore> & {
          activeDrawTool?: unknown;
        };

        typedState.activeDrawTool = normalizeActiveDrawTool(
          typedState.activeDrawTool,
        );

        if (version < 3) {
          typedState.walls = [];
        }

        return typedState;
      },
      partialize: (state) => ({
        devices: state.devices,
        walls: state.walls,
        currentBuildingId: state.currentBuildingId,
        currentFloorId: state.currentFloorId,
        isEditMode: state.isEditMode,
        activeDrawTool: state.activeDrawTool,
        selectedWallColor: state.selectedWallColor,
      }),
    },
  ),
);

type PersistApi = {
  rehydrate: () => Promise<void>;
};

const temporalStoreWithPersist =
  useMapStore.temporal as typeof useMapStore.temporal & {
    persist?: PersistApi;
  };

export async function rehydrateMapStore() {
  await Promise.all([
    useMapStore.persist.rehydrate(),
    temporalStoreWithPersist.persist?.rehydrate() ?? Promise.resolve(),
  ]);
}
