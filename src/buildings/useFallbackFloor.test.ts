import { afterEach, describe, expect, it } from "bun:test";
import { useEffect } from "react";
import { renderHook } from "@testing-library/react";
import { useMapStore } from "@/store/useMapStore";
import type { BuildingId, FloorId } from "@/types/map";
import { seedMapStore } from "../../test/storeHarness";
import { useFallbackFloor } from "./useFallbackFloor";

const building = "building:a" as BuildingId;
const ground = "floor:rdc" as FloorId;
const first = "floor:etage-1" as FloorId;
const floors = [{ id: ground }, { id: first }];

afterEach(() => {
  seedMapStore({ currentBuildingId: null, currentFloorId: null });
});

describe("useFallbackFloor", () => {
  it("keeps a floor a link opened earlier in the same pass of effects (A7)", () => {
    const { rerender } = renderHook(
      ({ loadedFloors }: { loadedFloors?: typeof floors }) => {
        // As the URL sync does, before the fallbacks, once the site's floors
        // and buildings arrive together.
        useEffect(() => {
          const store = useMapStore.getState();
          store.setCurrentBuilding(building);
          store.setCurrentFloor(first);
        }, []);
        useFallbackFloor([{ id: building }], loadedFloors);
      },
      { initialProps: {} },
    );
    expect(useMapStore.getState().currentFloorId).toBe(first);

    rerender({ loadedFloors: floors });
    expect(useMapStore.getState()).toMatchObject({
      currentBuildingId: building,
      currentFloorId: first,
    });
  });

  it("opens the first building's lowest floor when nothing is open", () => {
    const { rerender } = renderHook(
      ({ loadedFloors }: { loadedFloors?: typeof floors }) =>
        useFallbackFloor([{ id: building }], loadedFloors),
      { initialProps: {} },
    );
    expect(useMapStore.getState().currentBuildingId).toBe(building);
    rerender({ loadedFloors: floors });
    expect(useMapStore.getState().currentFloorId).toBe(ground);
  });
});
