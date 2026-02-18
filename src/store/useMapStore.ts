import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import type {
  Device,
  MapStore,
  Position,
  Size,
  WallDraft,
  WallSegment,
} from "@/types/map";
import { mockBuildings } from "@/mock/buildings";
import { mockDevices } from "@/mock/devices";
import {
  EMPTY_WALL_JUNCTIONS,
  applyWallJunctions,
  createRoomWallSegments,
  getWallGeometryKey,
  getWallIdsToDeleteFromSegments,
  getWallRect,
  splitWallSegmentsIntoBlocks,
} from "@/lib/walls";

const generateDeviceId = () =>
  `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const generateWallId = () =>
  `wall-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Helper to check if two rectangles overlap
const rectanglesOverlap = (
  pos1: Position,
  size1: Size,
  pos2: Position,
  size2: Size,
): boolean => {
  return !(
    pos1.x + size1.width <= pos2.x ||
    pos2.x + size2.width <= pos1.x ||
    pos1.y + size1.height <= pos2.y ||
    pos2.y + size2.height <= pos1.y
  );
};

const wallCollidesWithDevices = (
  wall: Pick<WallSegment, "start" | "end">,
  devices: Array<Device>,
): boolean => {
  const wallRect = getWallRect(wall);
  return devices.some((device) =>
    rectanglesOverlap(
      { x: wallRect.x, y: wallRect.y },
      { width: wallRect.width, height: wallRect.height },
      device.position,
      device.size,
    ),
  );
};

const toWallDraft = (wall: WallSegment): WallDraft => ({
  floorId: wall.floorId,
  color: wall.color,
  start: wall.start,
  end: wall.end,
});

const normalizeActiveDrawTool = (tool: unknown): MapStore["activeDrawTool"] => {
  if (
    tool === "device" ||
    tool === "wall" ||
    tool === "wall-erase" ||
    tool === "room"
  ) {
    return tool;
  }

  if (tool === "wall-brush") {
    return "wall-erase";
  }

  return "device";
};

const withRecomputedWallJunctions = (
  walls: Array<WallSegment>,
): Array<WallSegment> => {
  if (walls.length === 0) {
    return walls;
  }

  const wallsByFloor = walls.reduce<Map<string, Array<WallSegment>>>(
    (acc, wall) => {
      const floorWalls = acc.get(wall.floorId);
      if (floorWalls) {
        floorWalls.push(wall);
        return acc;
      }

      acc.set(wall.floorId, [wall]);
      return acc;
    },
    new Map(),
  );

  return Array.from(wallsByFloor.values()).flatMap((floorWalls) =>
    applyWallJunctions(floorWalls),
  );
};

export const useMapStore = create<MapStore>()(
  persist(
    temporal(
      (set, get) => ({
        // Initial state
        buildings: mockBuildings,
        devices: mockDevices,
        walls: [],
        currentBuildingId: mockBuildings[0]?.id ?? null,
        currentFloorId: mockBuildings[0]?.floors[0]?.id ?? null,
        selectedDeviceId: null,
        selectedWallId: null,
        hoveredDeviceId: null,
        isEditMode: true,
        highlightedDeviceIds: [],
        activeDrawTool: "device",
        selectedWallColor: "concrete",

        // Actions
        setCurrentBuilding: (buildingId: string) => {
          const building = get().buildings.find((b) => b.id === buildingId);
          set({
            currentBuildingId: buildingId,
            currentFloorId: building?.floors[0]?.id ?? null,
            selectedDeviceId: null,
            selectedWallId: null,
            highlightedDeviceIds: [],
          });
        },

        setCurrentFloor: (floorId: string) => {
          set({
            currentFloorId: floorId,
            selectedDeviceId: null,
            selectedWallId: null,
            highlightedDeviceIds: [],
          });
        },

        selectDevice: (deviceId: string | null) => {
          set((state) => ({
            selectedDeviceId: deviceId,
            selectedWallId: deviceId ? null : state.selectedWallId,
          }));
        },

        setHoveredDevice: (deviceId: string | null) => {
          set({ hoveredDeviceId: deviceId });
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
          if (!device) return;

          // Check for collision before updating
          const hasCollision = state.checkCollision(
            deviceId,
            position,
            device.size,
          );
          if (hasCollision) return;

          set((currentState) => ({
            devices: currentState.devices.map((d) =>
              d.id === deviceId ? { ...d, position } : d,
            ),
          }));
        },

        deleteDevice: (deviceId: string) => {
          set((state) => ({
            devices: state.devices.filter((d) => d.id !== deviceId),
            selectedDeviceId:
              state.selectedDeviceId === deviceId
                ? null
                : state.selectedDeviceId,
            highlightedDeviceIds: state.highlightedDeviceIds.filter(
              (id) => id !== deviceId,
            ),
          }));
        },

        selectWall: (wallId: string | null) => {
          set((state) => ({
            selectedWallId: wallId,
            selectedDeviceId: wallId ? null : state.selectedDeviceId,
          }));
        },

        deleteWall: (wallId: string) => {
          set((state) => ({
            walls: withRecomputedWallJunctions(
              state.walls.filter((wall) => wall.id !== wallId),
            ),
            selectedWallId:
              state.selectedWallId === wallId ? null : state.selectedWallId,
          }));
        },

        addWallBlocks: (segments: Array<WallDraft>) => {
          if (segments.length === 0) {
            return false;
          }

          const state = get();
          const candidateBlocks = splitWallSegmentsIntoBlocks(segments);

          if (candidateBlocks.length === 0) {
            return false;
          }

          const candidateBlocksByFloor = candidateBlocks.reduce<
            Map<string, Array<WallDraft>>
          >((acc, block) => {
            const floorBlocks = acc.get(block.floorId);
            if (floorBlocks) {
              floorBlocks.push(block);
              return acc;
            }

            acc.set(block.floorId, [block]);
            return acc;
          }, new Map());

          const uniqueBlocksToInsert: Array<WallDraft> = [];

          for (const [
            floorId,
            floorCandidateBlocks,
          ] of candidateBlocksByFloor) {
            const floorDevices = state.devices.filter(
              (device) => device.floorId === floorId,
            );

            const floorWalls = state.walls.filter(
              (wall) => wall.floorId === floorId,
            );
            const existingFloorBlocks = splitWallSegmentsIntoBlocks(
              floorWalls.map(toWallDraft),
            );

            const existingKeys = new Set(
              existingFloorBlocks
                .map((block) => getWallGeometryKey(block))
                .filter((key): key is string => key !== null),
            );

            const stagedKeys = new Set<string>();

            for (const block of floorCandidateBlocks) {
              if (wallCollidesWithDevices(block, floorDevices)) {
                return false;
              }

              const key = getWallGeometryKey(block);
              if (!key || existingKeys.has(key) || stagedKeys.has(key)) {
                continue;
              }

              stagedKeys.add(key);
              uniqueBlocksToInsert.push(block);
            }
          }

          if (uniqueBlocksToInsert.length === 0) {
            return false;
          }

          set((currentState) => ({
            walls: withRecomputedWallJunctions([
              ...currentState.walls,
              ...uniqueBlocksToInsert.map((block) => ({
                ...block,
                id: generateWallId(),
                junctions: { ...EMPTY_WALL_JUNCTIONS },
              })),
            ]),
          }));

          return true;
        },

        deleteWallBlocks: (segments: Array<WallDraft>) => {
          if (segments.length === 0) {
            return false;
          }

          const state = get();
          const wallIdsToDelete = getWallIdsToDeleteFromSegments(
            state.walls,
            segments,
          );

          if (wallIdsToDelete.size === 0) {
            return false;
          }

          set((currentState) => ({
            walls: withRecomputedWallJunctions(
              currentState.walls.filter(
                (wall) => !wallIdsToDelete.has(wall.id),
              ),
            ),
            selectedWallId:
              currentState.selectedWallId &&
              wallIdsToDelete.has(currentState.selectedWallId)
                ? null
                : currentState.selectedWallId,
          }));

          return true;
        },

        addWallSegment: (segment: WallDraft) => {
          return get().addWallBlocks([segment]);
        },

        addRoom: (room) => {
          const roomSegments = createRoomWallSegments(
            room.start,
            room.end,
            room.floorId,
            room.color,
          );
          if (roomSegments.length === 0) {
            return false;
          }

          return get().addWallBlocks(roomSegments);
        },

        toggleEditMode: () => {
          set((state) => ({
            isEditMode: !state.isEditMode,
            activeDrawTool: state.isEditMode ? "device" : state.activeDrawTool,
            selectedWallId: state.isEditMode ? null : state.selectedWallId,
          }));
        },

        setActiveDrawTool: (tool) => {
          set({ activeDrawTool: tool });
        },

        setSelectedWallColor: (color) => {
          set({ selectedWallColor: color });
        },

        setHighlightedDevices: (deviceIds: Array<string>) => {
          set({ highlightedDeviceIds: deviceIds });
        },

        checkCollision: (deviceId: string, position: Position, size: Size) => {
          const state = get();
          const currentFloorId = state.currentFloorId;

          // Get all other devices on the same floor
          const otherDevices = state.devices.filter(
            (d) => d.id !== deviceId && d.floorId === currentFloorId,
          );

          // Check collisions with devices.
          const deviceCollision = otherDevices.some((other) =>
            rectanglesOverlap(position, size, other.position, other.size),
          );
          if (deviceCollision) {
            return true;
          }

          // Check collisions with walls.
          const floorWalls = state.walls.filter(
            (wall) => wall.floorId === currentFloorId,
          );

          return floorWalls.some((wall) => {
            const wallRect = getWallRect(wall);
            return rectanglesOverlap(
              position,
              size,
              { x: wallRect.x, y: wallRect.y },
              { width: wallRect.width, height: wallRect.height },
            );
          });
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
            name: "netplan-temporal",
            skipHydration: true,
          }),
      },
    ),
    {
      name: "netplan-storage",
      version: 1,
      skipHydration: true,
      migrate: (persistedState) => {
        if (!persistedState || typeof persistedState !== "object") {
          return persistedState;
        }

        const typedState = persistedState as Partial<MapStore> & {
          activeDrawTool?: unknown;
        };

        typedState.activeDrawTool = normalizeActiveDrawTool(
          typedState.activeDrawTool,
        );

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
