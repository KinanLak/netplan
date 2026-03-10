import { describe, expect, it } from "bun:test";
import type { MapDocument } from "@/types/map";
import { createMockMapDocument } from "@/mock/document";
import {
  rehydrateMapStore,
  resetMapStoresForTests,
  useMapStore,
} from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";

describe("map store integration", () => {
  it("cleans UI references when deleting a selected device", () => {
    const document = createMockMapDocument();
    resetMapStoresForTests(document);

    useMapUiStore.getState().selectDevice("switch-2");
    useMapUiStore
      .getState()
      .setHighlightedDevices(["switch-2", "pc-3", "pc-4"]);

    const result = useMapStore
      .getState()
      .deleteDevice({ deviceId: "switch-2" });

    expect(result.ok).toBe(true);
    expect(useMapUiStore.getState().selectedDeviceId).toBe(null);
    expect(useMapUiStore.getState().highlightedDeviceIds).toEqual([]);
  });

  it("bootstraps from a repository and resets UI state cleanly", async () => {
    const document = createMockMapDocument();
    const customDocument: MapDocument = {
      ...document,
      devices: [
        ...document.devices,
        {
          id: "pc-bootstrap",
          type: "pc",
          name: "Bootstrap PC",
          floorId: "floor-1",
          position: { x: 900, y: 100 },
          size: { width: 80, height: 80 },
          metadata: {},
        },
      ],
    };
    const savedDocuments: Array<MapDocument> = [];

    useMapUiStore.getState().selectDevice("switch-1");
    useMapUiStore.getState().setHighlightedDevices(["switch-1"]);

    await rehydrateMapStore({
      load: () => Promise.resolve(customDocument),
      save: (nextDocument) => {
        savedDocuments.push(structuredClone(nextDocument));
        return Promise.resolve();
      },
    });

    expect(
      useMapStore
        .getState()
        .document.devices.some((device) => device.id === "pc-bootstrap"),
    ).toBe(true);
    expect(useMapUiStore.getState().selectedDeviceId).toBe(null);
    expect(useMapUiStore.getState().highlightedDeviceIds).toEqual([]);
    expect(useMapUiStore.getState().currentBuildingId).toBe("building-1");
    expect(useMapUiStore.getState().currentFloorId).toBe("floor-1");

    useMapStore.getState().deleteDevice({ deviceId: "pc-bootstrap" });

    expect(savedDocuments).toHaveLength(1);
    expect(
      savedDocuments[0]?.devices.some((device) => device.id === "pc-bootstrap"),
    ).toBe(false);
  });
});
