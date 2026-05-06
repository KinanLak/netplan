import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import { rehydrateMapStore, useMapStore } from "@/store/useMapStore";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { HotkeysProvider } from "@/components/hotkeys-provider";
import { useShortcut } from "@/hooks/use-shortcuts";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";

export const Route = createFileRoute("/")({
  ssr: true,
  component: HomePage,
});

function HomePage() {
  const [isStoreHydrated, setIsStoreHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    const hydrateStore = async () => {
      try {
        await rehydrateMapStore();
      } finally {
        if (mounted) {
          setIsStoreHydrated(true);
        }
      }
    };

    void hydrateStore();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="netplan-ui-theme">
      <HotkeysProvider>
        {isStoreHydrated ? (
          <>
            <HomePageContent />
          </>
        ) : (
          <div className="h-screen w-screen bg-background" />
        )}
      </HotkeysProvider>
    </ThemeProvider>
  );
}

function HomePageContent() {
  const selectedDeviceId = useMapStore((state) => state.selectedDeviceId);
  const isEditMode = useMapStore((state) => state.isEditMode);
  const toggleEditMode = useMapStore((state) => state.toggleEditMode);
  const selectDevice = useMapStore((state) => state.selectDevice);
  const activeDrawTool = useMapStore((state) => state.activeDrawTool);
  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const setHighlightedDevices = useMapStore(
    (state) => state.setHighlightedDevices,
  );
  const buildings = useMapStore((state) => state.buildings);
  const currentBuildingId = useMapStore((state) => state.currentBuildingId);
  const currentFloorId = useMapStore((state) => state.currentFloorId);
  const setCurrentFloor = useMapStore((state) => state.setCurrentFloor);
  const { theme, setTheme } = useTheme();
  const { handleUndo, handleRedo } = useUndoRedo();

  // Get current building's floors for navigation
  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);
  const floors = currentBuilding?.floors ?? [];
  const currentFloorIndex = floors.findIndex((f) => f.id === currentFloorId);

  const navigateFloorUp = () => {
    if (currentFloorIndex > 0) {
      setCurrentFloor(floors[currentFloorIndex - 1].id);
    }
  };

  const navigateFloorDown = () => {
    if (currentFloorIndex < floors.length - 1) {
      setCurrentFloor(floors[currentFloorIndex + 1].id);
    }
  };

  const cycleTheme = () => {
    const themeOrder = ["light", "dark", "system"] as const;
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  };

  // Register global shortcuts
  useShortcut("toggle-edit-mode", toggleEditMode);
  useShortcut("cycle-theme", cycleTheme);
  useShortcut(
    "escape",
    () => {
      // First deselect any device and clear highlights
      if (selectedDeviceId) {
        selectDevice(null);
        setActiveDrawTool("device");
        setHighlightedDevices([]);
        return;
      }
      // Then cancel any active draw tool (wall/room) without leaving edit mode
      if (activeDrawTool !== "device") {
        setActiveDrawTool("device");
        return;
      }
      // Then exit edit mode if active
      if (isEditMode) {
        toggleEditMode();
      }
    },
    { conflictBehavior: "allow" },
  );

  // Undo/redo via useShortcut (replaces native addEventListener handler)
  useShortcut("undo", handleUndo, {
    enabled: isEditMode,
    ignoreInputs: true,
  });
  useShortcut("redo", handleRedo, {
    enabled: isEditMode,
    ignoreInputs: true,
  });

  // Floor navigation — Mod is part of the key string, no modifier check needed
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
            {selectedDeviceId ? <DeviceDrawer /> : null}
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

          <ShortcutsDialog hasRightDrawerOpen={Boolean(selectedDeviceId)} />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
