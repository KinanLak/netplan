import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect, useState } from "react";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import { rehydrateMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";
import {
  useActiveDrawTool,
  useBuildings,
  useCurrentBuildingId,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
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
          <HomePageContent />
        ) : (
          <div className="h-screen w-screen bg-background" />
        )}
      </HotkeysProvider>
    </ThemeProvider>
  );
}

function HomePageContent() {
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const buildings = useBuildings();
  const currentBuildingId = useCurrentBuildingId();
  const currentFloorId = useCurrentFloorId();
  const toggleEditMode = useMapUiStore((state) => state.toggleEditMode);
  const selectDevice = useMapUiStore((state) => state.selectDevice);
  const setActiveDrawTool = useMapUiStore((state) => state.setActiveDrawTool);
  const setHighlightedDevices = useMapUiStore(
    (state) => state.setHighlightedDevices,
  );
  const setCurrentFloor = useMapUiStore((state) => state.setCurrentFloor);
  const { theme, setTheme } = useTheme();
  const { handleUndo, handleRedo } = useUndoRedo();

  const currentBuilding = buildings.find(
    (building) => building.id === currentBuildingId,
  );
  const floors = currentBuilding?.floors ?? [];
  const currentFloorIndex = floors.findIndex(
    (floor) => floor.id === currentFloorId,
  );

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

  useShortcut("toggle-edit-mode", toggleEditMode);
  useShortcut("cycle-theme", cycleTheme);
  useShortcut("escape", () => {
    if (selectedDeviceId) {
      selectDevice(null);
      setActiveDrawTool("device");
      setHighlightedDevices([]);
      return;
    }

    if (activeDrawTool !== "device") {
      setActiveDrawTool("device");
      return;
    }

    if (isEditMode) {
      toggleEditMode();
    }
  });

  useShortcut("undo", handleUndo, {
    enabled: isEditMode,
    ignoreInputs: true,
  });
  useShortcut("redo", handleRedo, {
    enabled: isEditMode,
    ignoreInputs: true,
  });
  useShortcut("floor-up", navigateFloorUp);
  useShortcut("floor-down", navigateFloorDown);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-background">
        <AppSidebar />

        <SidebarInset className="relative">
          <ReactFlowProvider>
            <FlowCanvas />
            <Toolbar />
            {selectedDeviceId ? <DeviceDrawer /> : null}
          </ReactFlowProvider>

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
