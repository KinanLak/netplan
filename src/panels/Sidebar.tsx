import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building05Icon,
  DashedLine01Icon,
  SolidLine01Icon,
} from "@hugeicons/core-free-icons";
import { useMapStore } from "@/store/useMapStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  const {
    buildings,
    currentBuildingId,
    currentFloorId,
    setCurrentBuilding,
    setCurrentFloor,
  } = useMapStore();

  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);

  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex h-full w-64 flex-col border-r">
      {/* Header */}
      <div className="border-sidebar-border border-b p-4">
        <h1 className="text-lg font-bold tracking-tight">
          <span className="text-primary">Net</span>Plan
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cartographie Réseau
        </p>
      </div>

      {/* Buildings & Floors */}
      <ScrollArea className="flex-1 p-3">
        <div className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
          Bâtiments
        </div>

        {buildings.map((building) => (
          <div key={building.id} className="mb-3">
            {/* Building */}
            <Button
              variant={building.id === currentBuildingId ? "default" : "ghost"}
              onClick={() => setCurrentBuilding(building.id)}
              className={cn(
                "w-full justify-start gap-2",
                building.id !== currentBuildingId &&
                  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <HugeiconsIcon
                icon={Building05Icon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
              />
              {building.name}
            </Button>

            {/* Floors (only show if building is selected) */}
            {building.id === currentBuildingId && (
              <div className="mt-1 ml-4 space-y-1">
                {building.floors.map((floor) => (
                  <Button
                    key={floor.id}
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentFloor(floor.id)}
                    className={cn(
                      "w-full justify-start gap-2",
                      floor.id === currentFloorId
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                    )}
                  >
                    <HugeiconsIcon
                      icon={
                        floor.id === currentFloorId
                          ? SolidLine01Icon
                          : DashedLine01Icon
                      }
                      size={20}
                      color="currentColor"
                      strokeWidth={1}
                    />
                    {floor.name}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ))}
      </ScrollArea>

      {/* Footer */}
      <div className="border-sidebar-border border-t p-4">
        <div className="text-muted-foreground text-xs">
          {currentBuilding?.name ?? "Aucun bâtiment"}
        </div>
      </div>
    </aside>
  );
}
