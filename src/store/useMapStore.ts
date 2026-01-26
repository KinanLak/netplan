import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MapStore, Device, Position } from "../types/map";
import { mockBuildings } from "../mock/buildings";
import { mockDevices } from "../mock/devices";

const generateId = () => `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const useMapStore = create<MapStore>()(
    persist(
        (set, get) => ({
            // Initial state
            buildings: mockBuildings,
            devices: mockDevices,
            currentBuildingId: mockBuildings[0]?.id ?? null,
            currentFloorId: mockBuildings[0]?.floors[0]?.id ?? null,
            selectedDeviceId: null,

            // Actions
            setCurrentBuilding: (buildingId: string) => {
                const building = get().buildings.find((b) => b.id === buildingId);
                set({
                    currentBuildingId: buildingId,
                    currentFloorId: building?.floors[0]?.id ?? null,
                    selectedDeviceId: null,
                });
            },

            setCurrentFloor: (floorId: string) => {
                set({
                    currentFloorId: floorId,
                    selectedDeviceId: null,
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
                set((state) => ({
                    devices: state.devices.map((d) => (d.id === deviceId ? { ...d, position } : d)),
                }));
            },

            deleteDevice: (deviceId: string) => {
                set((state) => ({
                    devices: state.devices.filter((d) => d.id !== deviceId),
                    selectedDeviceId: state.selectedDeviceId === deviceId ? null : state.selectedDeviceId,
                }));
            },
        }),
        {
            name: "netplan-storage",
            partialize: (state) => ({
                devices: state.devices,
                currentBuildingId: state.currentBuildingId,
                currentFloorId: state.currentFloorId,
            }),
        },
    ),
);
