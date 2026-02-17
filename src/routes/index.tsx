import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import WallDrawer from "@/panels/WallDrawer";
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
            <ShortcutsDialog />
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
  const { handleUndo, handleRedo } = useUndoRedo();

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    const handleUndoRedoHotkeys = (event: KeyboardEvent) => {
      if (!isEditMode) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const modPressed = event.ctrlKey || event.metaKey;

      if (!modPressed) {
        return;
      }

      if (!event.shiftKey && key === "z") {
        event.preventDefault();
        handleUndo();
        return;
      }

      if ((event.shiftKey && key === "z") || (!event.shiftKey && key === "y")) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleUndoRedoHotkeys, true);

    return () => {
      window.removeEventListener("keydown", handleUndoRedoHotkeys, true);
    };
  }, [handleUndo, handleRedo, isEditMode]);

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

  const navigateToFloorByIndex = (index: number) => {
    if (index >= 0 && index < floors.length) {
      setCurrentFloor(floors[index].id);
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
  useShortcut("floor-1", () => navigateToFloorByIndex(0));
  useShortcut("floor-2", () => navigateToFloorByIndex(1));
  useShortcut("floor-3", () => navigateToFloorByIndex(2));
  useShortcut("floor-4", () => navigateToFloorByIndex(3));
  useShortcut("floor-5", () => navigateToFloorByIndex(4));
  useShortcut("floor-6", () => navigateToFloorByIndex(5));
  useShortcut("floor-7", () => navigateToFloorByIndex(6));
  useShortcut("floor-8", () => navigateToFloorByIndex(7));
  useShortcut("floor-9", () => navigateToFloorByIndex(8));

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
