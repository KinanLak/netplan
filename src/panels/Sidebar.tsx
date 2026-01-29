import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building05Icon,
  DashedLine01Icon,
  SolidLine01Icon,
} from "@hugeicons/core-free-icons";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";

export default function AppSidebar() {
  const {
    buildings,
    currentBuildingId,
    currentFloorId,
    setCurrentBuilding,
    setCurrentFloor,
  } = useMapStore();

  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);

  return (
    <Sidebar collapsible="none" className="border-r">
      {/* Header */}
      <SidebarHeader className="border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-primary">Net</span>Plan
            </h1>
            <p className="text-muted-foreground text-sm">Cartographie Réseau</p>
          </div>
          <ModeToggle />
        </div>
      </SidebarHeader>

      {/* Content */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Bâtiments</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {buildings.map((building) => (
                <SidebarMenuItem key={building.id}>
                  <SidebarMenuButton
                    onClick={() => setCurrentBuilding(building.id)}
                    className={cn(
                      "cursor-pointer",
                      building.id === currentBuildingId &&
                        "text-foreground font-medium",
                    )}
                  >
                    <HugeiconsIcon
                      icon={Building05Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    <span>{building.name}</span>
                  </SidebarMenuButton>

                  {/* Floors (only show if building is selected) */}
                  {building.id === currentBuildingId && (
                    <SidebarMenuSub>
                      {building.floors.map((floor) => (
                        <SidebarMenuSubItem key={floor.id}>
                          <SidebarMenuSubButton
                            onClick={() => setCurrentFloor(floor.id)}
                            className={cn(
                              "cursor-pointer",
                              floor.id === currentFloorId &&
                                "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground font-semibold",
                            )}
                          >
                            <HugeiconsIcon
                              icon={
                                floor.id === currentFloorId
                                  ? SolidLine01Icon
                                  : DashedLine01Icon
                              }
                              size={16}
                              strokeWidth={1}
                            />
                            <span>{floor.name}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="border-t px-4 py-3">
        <div className="text-muted-foreground text-xs">
          {currentBuilding?.name ?? "Aucun bâtiment"}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
