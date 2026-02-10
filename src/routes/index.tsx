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
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { HotkeysProvider } from "@/components/hotkeys-provider";
import { useShortcut } from "@/hooks/use-shortcuts";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";

export const Route = createFileRoute("/")({
  ssr: true,
  component: HomePage,
});

function HomePage() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="netplan-ui-theme">
      <HotkeysProvider>
        <HomePageContent />
        <ShortcutsDialog />
      </HotkeysProvider>
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
  const setHighlightedDevices = useMapStore(
    (state) => state.setHighlightedDevices,
  );
  const buildings = useMapStore((state) => state.buildings);
  const currentBuildingId = useMapStore((state) => state.currentBuildingId);
  const currentFloorId = useMapStore((state) => state.currentFloorId);
  const setCurrentFloor = useMapStore((state) => state.setCurrentFloor);
  const { theme, setTheme } = useTheme();

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

  // Navigate to floor by index (0-based)
  const navigateToFloorByIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < floors.length) {
        setCurrentFloor(floors[index].id);
      }
    },
    [floors, setCurrentFloor],
  );

  // Theme cycling handler
  const cycleTheme = useCallback(() => {
    const themeOrder = ["light", "dark", "system"] as const;
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  }, [theme, setTheme]);

  // Register global shortcuts
  useShortcut("toggle-edit-mode", toggleEditMode);
  useShortcut("cycle-theme", cycleTheme);
  useShortcut("escape", () => {
    // First deselect any device/wall and clear highlights
    if (selectedDeviceId || selectedWallId) {
      selectDevice(null);
      selectWall(null);
      setActiveDrawTool("device");
      setHighlightedDevices([]);
      return;
    }
    // Then exit edit mode if active
    if (isEditMode) {
      toggleEditMode();
    }
  });
  useShortcut("floor-up", navigateFloorUp);
  useShortcut("floor-down", navigateFloorDown);

  // Floor number shortcuts (Ctrl+1 through Ctrl+9)
  useShortcut(
    "floor-1",
    useCallback(() => navigateToFloorByIndex(0), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-2",
    useCallback(() => navigateToFloorByIndex(1), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-3",
    useCallback(() => navigateToFloorByIndex(2), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-4",
    useCallback(() => navigateToFloorByIndex(3), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-5",
    useCallback(() => navigateToFloorByIndex(4), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-6",
    useCallback(() => navigateToFloorByIndex(5), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-7",
    useCallback(() => navigateToFloorByIndex(6), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-8",
    useCallback(() => navigateToFloorByIndex(7), [navigateToFloorByIndex]),
  );
  useShortcut(
    "floor-9",
    useCallback(() => navigateToFloorByIndex(8), [navigateToFloorByIndex]),
  );

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
