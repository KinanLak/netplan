import { create } from "zustand";
import { persist } from "zustand/middleware";
import { temporal } from "zundo";
import type { MapStore } from "@/types/map";
import { mockBuildings } from "@/mock/buildings";
import { mockDevices } from "@/mock/devices";
import { createMapCommands, toHighlightedDeviceIdSet } from "./mapCommands";
import {
  MAP_STORAGE_NAME,
  MAP_STORAGE_VERSION,
  areMapHistorySnapshotsEqual,
  migrateMapState,
  partializeMapHistory,
  partializePersistedMapState,
} from "./mapPersistence";

const generateDeviceId = () =>
  `device-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const generateWallId = () =>
  `wall-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

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
        ...createMapCommands({
          set,
          get,
          generateDeviceId,
          generateWallId,
        }),
      }),
      {
        partialize: partializeMapHistory,
        equality: areMapHistorySnapshotsEqual,
        limit: 500,
      },
    ),
    {
      name: MAP_STORAGE_NAME,
      version: MAP_STORAGE_VERSION,
      skipHydration: true,
      migrate: migrateMapState,
      partialize: partializePersistedMapState,
    },
  ),
);

const LEGACY_TEMPORAL_STORAGE_KEY = "netplan-temporal-v3";

export async function rehydrateMapStore() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(LEGACY_TEMPORAL_STORAGE_KEY);
  }
  await useMapStore.persist.rehydrate();
}
