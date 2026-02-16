import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import type {
  Device,
  MapStore,
  Position,
  Size,
  WallSegment,
} from "@/types/map";
import { mockBuildings } from "@/mock/buildings";
import { mockDevices } from "@/mock/devices";
import {
  areSameWallGeometry,
  createRoomWallSegments,
  getWallRect,
  isPointConnectedToWalls,
  normalizeWallSegmentPoints,
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

const roomTouchesFloorWalls = (
  roomSegments: Array<Omit<WallSegment, "id">>,
  floorWalls: Array<WallSegment>,
): boolean => {
  if (floorWalls.length === 0) {
    return true;
  }

  return roomSegments.some(
    (segment) =>
      isPointConnectedToWalls(segment.start, floorWalls) ||
      isPointConnectedToWalls(segment.end, floorWalls),
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
            walls: state.walls.filter((wall) => wall.id !== wallId),
            selectedWallId:
              state.selectedWallId === wallId ? null : state.selectedWallId,
          }));
        },

        addWallSegment: (segment: Omit<WallSegment, "id">) => {
          const normalized = normalizeWallSegmentPoints(
            segment.start,
            segment.end,
          );
          if (!normalized) {
            return false;
          }

          const state = get();
          const floorWalls = state.walls.filter(
            (wall) => wall.floorId === segment.floorId,
          );

          const candidate: Omit<WallSegment, "id"> = {
            ...segment,
            start: normalized.start,
            end: normalized.end,
          };

          const floorDevices = state.devices.filter(
            (device) => device.floorId === segment.floorId,
          );
          if (wallCollidesWithDevices(candidate, floorDevices)) {
            return false;
          }

          const hasDuplicate = floorWalls.some((wall) =>
            areSameWallGeometry(wall, candidate),
          );
          if (hasDuplicate) {
            return false;
          }

          set((currentState) => ({
            walls: [
              ...currentState.walls,
              { ...candidate, id: generateWallId() },
            ],
          }));

          return true;
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

          const state = get();
          const floorWalls = state.walls.filter(
            (wall) => wall.floorId === room.floorId,
          );
          const floorDevices = state.devices.filter(
            (device) => device.floorId === room.floorId,
          );

          const roomHitsDevice = roomSegments.some((segment) =>
            wallCollidesWithDevices(segment, floorDevices),
          );
          if (roomHitsDevice) {
            return false;
          }

          if (!roomTouchesFloorWalls(roomSegments, floorWalls)) {
            return false;
          }

          const uniqueSegments = roomSegments.filter(
            (segment) =>
              !floorWalls.some((wall) => areSameWallGeometry(wall, segment)),
          );

          if (uniqueSegments.length === 0) {
            return false;
          }

          set((currentState) => ({
            walls: [
              ...currentState.walls,
              ...uniqueSegments.map((segment) => ({
                ...segment,
                id: generateWallId(),
              })),
            ],
          }));

          return true;
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
          persist(storeInitializer, { name: "netplan-temporal" }),
      },
    ),
    {
      name: "netplan-storage",
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
