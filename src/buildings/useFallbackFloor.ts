import { useEffect } from "react";
import { asBuildingId } from "@/lib/objectIds";
import { useCurrentBuildingId, useCurrentFloorId } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { FloorId } from "@/types/map";

/**
 * Opens the site's first building and its lowest floor when none is open, or
 * when the one open has gone. It reads the store, not the render: a link or
 * a reload may have opened a floor earlier in the same pass of effects, which
 * a fallback reading the render would undo (A7).
 */
export function useFallbackFloor(
  buildings: ReadonlyArray<{ id: string }> | undefined,
  /** The open building's floors, lowest first; undefined while they load. */
  floors: ReadonlyArray<{ id: FloorId }> | undefined,
) {
  const currentBuildingId = useCurrentBuildingId();
  // Only to run again when the floor is closed, as opening a building does.
  const currentFloorId = useCurrentFloorId();
  const setCurrentBuilding = useMapStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);

  useEffect(() => {
    if (!buildings) return;
    const { currentBuildingId: current } = useMapStore.getState();
    if (buildings.length === 0) {
      if (current) setCurrentBuilding(null);
      return;
    }
    if (current && buildings.some((building) => building.id === current)) {
      return;
    }
    setCurrentBuilding(asBuildingId(buildings[0].id));
  }, [buildings, currentBuildingId, setCurrentBuilding]);

  useEffect(() => {
    if (!floors) return;
    const { currentBuildingId: building, currentFloorId: current } =
      useMapStore.getState();
    // These floors are those of the building this render opened; another
    // has opened since, and its floors are on their way.
    if (building !== currentBuildingId) return;
    if (current && floors.some((floor) => floor.id === current)) return;
    setCurrentFloor(floors[0]?.id ?? null);
  }, [floors, currentBuildingId, currentFloorId, setCurrentFloor]);
}
