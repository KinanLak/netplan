import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useCallback } from "react";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import WallDrawer from "@/panels/WallDrawer";
import { useMapStore } from "@/store/useMapStore";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ShortcutsProvider, useShortcut } from "@/hooks/use-shortcuts";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
});

function HomePage() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="netplan-ui-theme">
      <ShortcutsProvider>
        <HomePageContent />
        <ShortcutsDialog />
      </ShortcutsProvider>
    </ThemeProvider>
  );
}

function HomePageContent() {
  const selectedDeviceId = useMapStore((state) => state.selectedDeviceId);
  const selectedWallId = useMapStore((state) => state.selectedWallId);
  const isEditMode = useMapStore((state) => state.isEditMode);
  const toggleEditMode = useMapStore((state) => state.toggleEditMode);
  const selectDevice = useMapStore((state) => state.selectDevice);
  const selectWall = useMapStore((state) => state.selectWall);
  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const buildings = useMapStore((state) => state.buildings);
  const currentBuildingId = useMapStore((state) => state.currentBuildingId);
  const currentFloorId = useMapStore((state) => state.currentFloorId);
  const setCurrentFloor = useMapStore((state) => state.setCurrentFloor);

  // Get current building's floors for navigation
  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);
  const floors = currentBuilding?.floors ?? [];
  const currentFloorIndex = floors.findIndex((f) => f.id === currentFloorId);

  // Floor navigation handlers
  const navigateFloorUp = useCallback(() => {
    if (currentFloorIndex < floors.length - 1) {
      setCurrentFloor(floors[currentFloorIndex + 1].id);
    }
  }, [currentFloorIndex, floors, setCurrentFloor]);

  const navigateFloorDown = useCallback(() => {
    if (currentFloorIndex > 0) {
      setCurrentFloor(floors[currentFloorIndex - 1].id);
    }
  }, [currentFloorIndex, floors, setCurrentFloor]);

  // Register global shortcuts
  useShortcut("toggle-edit-mode", toggleEditMode);
  useShortcut("escape", () => {
    selectDevice(null);
    selectWall(null);
    setActiveDrawTool("device");
  });
  useShortcut("floor-up", navigateFloorUp);
  useShortcut("floor-down", navigateFloorDown);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        {/* Sidebar */}
        <AppSidebar />

        {/* Main canvas area */}
        <SidebarInset className="relative">
          <ReactFlowProvider>
            <FlowCanvas />
            <Toolbar />
            {/* Device details drawer (conditional) - inside ReactFlowProvider for camera control */}
            {selectedDeviceId ? (
              <DeviceDrawer />
            ) : selectedWallId ? (
              <WallDrawer />
            ) : null}
          </ReactFlowProvider>

          {/* Mode toggle button - top left */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <button
              onClick={toggleEditMode}
              className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-lg transition-all ${
                isEditMode
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-primary bg-primary text-primary-foreground"
              } `}
              title={
                isEditMode ? "Terminer les modifications" : "Modifier le plan"
              }
            >
              {isEditMode ? (
                <>
                  <HugeiconsIcon
                    icon={Tick01Icon}
                    size={20}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  Terminer
                </>
              ) : (
                <>
                  <HugeiconsIcon
                    icon={Edit01Icon}
                    size={20}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                  Modifier
                </>
              )}
              <ShortcutHintAbsolute
                action="toggle-edit-mode"
                position="bottom-right"
              />
            </button>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
