import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import { useMapStore } from "@/store/useMapStore";
import { useMapCommands } from "@/store/useMapCommands";
import {
  useActiveDrawTool,
  useCurrentBuildingId,
  useCurrentFloorId,
  useHighlightedDeviceIds,
  useHoveredDeviceId,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import {
  ShortcutIntentProvider,
  useShortcutIntentEffect,
} from "@/hooks/use-shortcuts";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { getNextConnectionHighlightIds } from "@/lib/shortcut-intents";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/")({
  ssr: true,
  component: HomePage,
});

function HomePage() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="netplan-ui-theme">
      <ShortcutIntentProvider>
        <HomePageContent />
      </ShortcutIntentProvider>
    </ThemeProvider>
  );
}

function HomePageContent() {
  const buildings = useQuery(api.buildings.list);
  const currentBuildingId = useCurrentBuildingId();
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const hoveredDeviceId = useHoveredDeviceId();
  const highlightedDeviceIds = useHighlightedDeviceIds();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();

  const setCurrentBuilding = useMapStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);
  const toggleEditMode = useMapStore((s) => s.toggleEditMode);
  const selectDevice = useMapStore((s) => s.selectDevice);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const setHighlightedDevices = useMapStore((s) => s.setHighlightedDevices);

  const floors = useQuery(
    api.floors.listForBuilding,
    currentBuildingId ? { buildingId: currentBuildingId } : "skip",
  );

  const links = useQuery(
    api.links.listForFloor,
    currentFloorId ? { floorId: currentFloorId } : "skip",
  );

  const commands = useMapCommands(currentFloorId);

  const { theme, setTheme } = useTheme();
  const { handleUndo, handleRedo } = useUndoRedo();

  useEffect(() => {
    if (currentBuildingId !== null) return;
    if (!buildings || buildings.length === 0) return;
    setCurrentBuilding(buildings[0]._id);
  }, [buildings, currentBuildingId, setCurrentBuilding]);

  const sortedFloors = floors
    ? [...floors].sort((a, b) => a.order - b.order)
    : [];

  useEffect(() => {
    if (!floors) return;
    if (currentFloorId && floors.some((f) => f._id === currentFloorId)) return;
    const sorted = [...floors].sort((a, b) => a.order - b.order);
    setCurrentFloor(sorted[0]?._id ?? null);
  }, [floors, currentFloorId, setCurrentFloor]);
  const currentFloorIndex = sortedFloors.findIndex(
    (f) => f._id === currentFloorId,
  );

  const navigateFloorUp = () => {
    if (currentFloorIndex > 0) {
      setCurrentFloor(sortedFloors[currentFloorIndex - 1]._id);
    }
  };

  const navigateFloorDown = () => {
    if (currentFloorIndex >= 0 && currentFloorIndex < sortedFloors.length - 1) {
      setCurrentFloor(sortedFloors[currentFloorIndex + 1]._id);
    }
  };

  const cycleTheme = () => {
    const themeOrder = ["light", "dark", "system"] as const;
    const currentIndex = themeOrder.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeOrder.length;
    setTheme(themeOrder[nextIndex]);
  };

  const closeDrawer = () => {
    selectDevice(null);
    setActiveDrawTool("device");
    setHighlightedDevices([]);
  };

  const deleteSelectedDevice = () => {
    if (!selectedDeviceId) return;
    commands.deleteDevice(selectedDeviceId);
    selectDevice(null);
  };

  const highlightConnections = () => {
    const next = getNextConnectionHighlightIds({
      links: links ?? [],
      highlightedDeviceIds,
      hoveredDeviceId,
      selectedDeviceId,
    });

    if (next) {
      setHighlightedDevices(next);
    }
  };

  useShortcutIntentEffect("toggle-edit-mode", toggleEditMode);
  useShortcutIntentEffect("cycle-theme", cycleTheme);
  useShortcutIntentEffect("close-drawer", closeDrawer);
  useShortcutIntentEffect("delete-device", deleteSelectedDevice);
  useShortcutIntentEffect("highlight-connections", highlightConnections);
  useShortcutIntentEffect("escape", () => {
    if (isEditMode && activeDrawTool === "device") {
      toggleEditMode();
    }
  });
  useShortcutIntentEffect("undo", handleUndo);
  useShortcutIntentEffect("redo", handleRedo);
  useShortcutIntentEffect("floor-up", navigateFloorUp);
  useShortcutIntentEffect("floor-down", navigateFloorDown);

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
