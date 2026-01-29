import { createFileRoute } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import { useMapStore } from "@/store/useMapStore";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";

export const Route = createFileRoute("/")({
  ssr: false,
  component: HomePage,
});

function HomePage() {
  const selectedDeviceId = useMapStore((state) => state.selectedDeviceId);
  const isEditMode = useMapStore((state) => state.isEditMode);
  const toggleEditMode = useMapStore((state) => state.toggleEditMode);

  return (
    <ThemeProvider defaultTheme="system" storageKey="netplan-ui-theme">
      <SidebarProvider>
        <div className="bg-background flex h-screen w-screen overflow-hidden">
          {/* Sidebar */}
          <AppSidebar />

          {/* Main canvas area */}
          <SidebarInset className="relative">
            <ReactFlowProvider>
              <FlowCanvas />
              <Toolbar />
              {/* Device details drawer (conditional) - inside ReactFlowProvider for camera control */}
              {selectedDeviceId && <DeviceDrawer />}
            </ReactFlowProvider>

            {/* Mode toggle button - top left */}
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              <button
                onClick={toggleEditMode}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-lg transition-all ${
                  isEditMode
                    ? "bg-accent border-accent text-accent-foreground"
                    : "bg-primary border-primary text-primary-foreground"
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
              </button>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}
