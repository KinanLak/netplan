import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building05Icon,
  DashedLine01Icon,
  RedoIcon,
  SolidLine01Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";
import { isMac } from "@/lib/shortcuts";
import { useTemporalStore, useUndoRedo } from "@/hooks/use-undo-redo";
import { Button } from "@/components/ui/button";
import { ShortcutHintKeys } from "@/components/ui/shortcut-hint";
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
  const buildings = useMapStore((s) => s.buildings);
  const currentBuildingId = useMapStore((s) => s.currentBuildingId);
  const currentFloorId = useMapStore((s) => s.currentFloorId);
  const isEditMode = useMapStore((s) => s.isEditMode);

  const setCurrentBuilding = useMapStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);

  const { handleUndo, handleRedo } = useUndoRedo();
  const canUndo = useTemporalStore((s) => s.pastStates.length > 0);
  const canRedo = useTemporalStore((s) => s.futureStates.length > 0);

  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);

  const handleResetCanvasStorage = () => {
    const keysToRemove: Array<string> = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) {
        continue;
      }

      if (key.startsWith("netplan-") && key !== "netplan-ui-theme") {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });

    window.location.reload();
  };

  return (
    <Sidebar collapsible="none" className="border-r">
      {/* Header */}
      <SidebarHeader className="border-b px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-primary">Net</span>Plan
            </h1>
            <p className="text-sm text-muted-foreground">Cartographie Réseau</p>
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
                        "font-medium text-foreground",
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
                  {building.id === currentBuildingId ? (
                    <SidebarMenuSub>
                      {building.floors.map((floor, floorIndex) => {
                        const isActive = floor.id === currentFloorId;
                        const shortcutNumber = floorIndex + 1;
                        const showShortcut = shortcutNumber <= 9;

                        return (
                          <SidebarMenuSubItem key={floor.id}>
                            <SidebarMenuSubButton
                              onClick={() => setCurrentFloor(floor.id)}
                              className={cn(
                                "cursor-pointer justify-between",
                                isActive &&
                                  "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <HugeiconsIcon
                                  icon={
                                    isActive
                                      ? SolidLine01Icon
                                      : DashedLine01Icon
                                  }
                                  size={16}
                                  strokeWidth={1}
                                />
                                <span>{floor.name}</span>
                              </span>
                              {showShortcut ? (
                                <ShortcutHintKeys
                                  keys={[
                                    isMac ? "⌃" : "Ctrl",
                                    String(shortcutNumber),
                                  ]}
                                  size="sm"
                                  className="ml-auto"
                                  kbdClassName={cn(
                                    isActive &&
                                      "bg-primary-foreground text-primary",
                                  )}
                                />
                              ) : null}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Undo / Redo */}
      <div className="border-t px-4 py-2">
        <div className="flex w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={!isEditMode || !canUndo}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-r-none text-xs"
            title="Annuler (Ctrl+Z)"
          >
            <HugeiconsIcon icon={UndoIcon} size={14} strokeWidth={1.5} />
            Annuler
          </Button>
          <div className="w-px bg-border" aria-hidden />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRedo}
            disabled={!isEditMode || !canRedo}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-l-none text-xs"
            title="Rétablir (Ctrl+Shift+Z)"
          >
            Rétablir
            <HugeiconsIcon icon={RedoIcon} size={14} strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Footer */}
      <SidebarFooter className="border-t px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs text-muted-foreground">
            {currentBuilding?.name ?? "Aucun bâtiment"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleResetCanvasStorage}
            className="h-7 px-2 text-xs"
          >
            Vider plan
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
