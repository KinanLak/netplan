import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MapStore, Device, Position, Size } from "@/types/map";
import { mockBuildings } from "@/mock/buildings";
import { mockDevices } from "@/mock/devices";

const generateId = () => `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// Helper to check if two rectangles overlap
const rectanglesOverlap = (pos1: Position, size1: Size, pos2: Position, size2: Size): boolean => {
    return !(
        pos1.x + size1.width <= pos2.x ||
        pos2.x + size2.width <= pos1.x ||
        pos1.y + size1.height <= pos2.y ||
        pos2.y + size2.height <= pos1.y
    );
};

export const useMapStore = create<MapStore>()(
    persist(
        (set, get) => ({
            // Initial state
            buildings: mockBuildings,
            devices: mockDevices,
            currentBuildingId: mockBuildings[0]?.id ?? null,
            currentFloorId: mockBuildings[0]?.floors[0]?.id ?? null,
            selectedDeviceId: null,
            isEditMode: true,
            highlightedDeviceIds: [],

            // Actions
            setCurrentBuilding: (buildingId: string) => {
                const building = get().buildings.find((b) => b.id === buildingId);
                set({
                    currentBuildingId: buildingId,
                    currentFloorId: building?.floors[0]?.id ?? null,
                    selectedDeviceId: null,
                    highlightedDeviceIds: [],
                });
            },

            setCurrentFloor: (floorId: string) => {
                set({
                    currentFloorId: floorId,
                    selectedDeviceId: null,
                    highlightedDeviceIds: [],
                });
            },

            selectDevice: (deviceId: string | null) => {
                set({ selectedDeviceId: deviceId });
            },

            addDevice: (deviceData: Omit<Device, "id">) => {
                const newDevice: Device = {
                    ...deviceData,
                    id: generateId(),
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
                const hasCollision = state.checkCollision(deviceId, position, device.size);
                if (hasCollision) return;

                set((state) => ({
                    devices: state.devices.map((d) => (d.id === deviceId ? { ...d, position } : d)),
                }));
            },

            deleteDevice: (deviceId: string) => {
                set((state) => ({
                    devices: state.devices.filter((d) => d.id !== deviceId),
                    selectedDeviceId: state.selectedDeviceId === deviceId ? null : state.selectedDeviceId,
                    highlightedDeviceIds: state.highlightedDeviceIds.filter((id) => id !== deviceId),
                }));
            },

            toggleEditMode: () => {
                set((state) => ({ isEditMode: !state.isEditMode }));
            },

            setHighlightedDevices: (deviceIds: string[]) => {
                set({ highlightedDeviceIds: deviceIds });
            },

            checkCollision: (deviceId: string, position: Position, size: Size) => {
                const state = get();
                const currentFloorId = state.currentFloorId;

                // Get all other devices on the same floor
                const otherDevices = state.devices.filter((d) => d.id !== deviceId && d.floorId === currentFloorId);

                // Check if the new position would collide with any other device
                return otherDevices.some((other) => rectanglesOverlap(position, size, other.position, other.size));
            },
        }),
        {
            name: "netplan-storage",
            partialize: (state) => ({
                devices: state.devices,
                currentBuildingId: state.currentBuildingId,
                currentFloorId: state.currentFloorId,
                isEditMode: state.isEditMode,
            }),
        },
    ),
);
