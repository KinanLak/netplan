import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Edit01Icon, Tick01Icon, ViewIcon } from "@hugeicons/core-free-icons";
import { useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import FlowCanvas from "@/canvas/FlowCanvas";
import AppSidebar from "@/panels/Sidebar";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import { MapDocumentStatus } from "@/map-session/MapDocumentStatus";
import {
  useMapDocumentActions,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import {
  useCurrentBuildingId,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import type { Floor } from "@/types/map";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import {
  ShortcutIntentProvider,
  useShortcutIntentEffect,
} from "@/hooks/use-shortcuts";
import { useCanEdit, useCurrentUser } from "@/hooks/use-current-user";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSignOut } from "@/panels/SidebarAccount";
import { isAdmin } from "@/lib/roles";
import { siteSearch, useCurrentSite } from "@/sites/useCurrentSite";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { getNextConnectionHighlightIds } from "@/lib/shortcut-intents";
import { asBuildingId, asFloorId } from "@/lib/objectIds";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  validateSearch: siteSearch,
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
  const { site: requestedSiteId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { site } = useCurrentSite();
  const buildings = useQuery(
    api.buildings.listForSite,
    site ? { siteId: site.id } : "skip",
  );
  const currentBuildingId = useCurrentBuildingId();
  const currentFloorId = useCurrentFloorId();

  const setCurrentBuilding = useMapStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);

  const floors = useQuery(
    api.floors.listForBuilding,
    currentBuildingId ? { buildingId: currentBuildingId } : "skip",
  );

  // The URL always names the site shown, so a link or a reload keeps it.
  useEffect(() => {
    if (!site || site.id === requestedSiteId) return;
    void navigate({ search: { site: site.id }, replace: true });
  }, [site, requestedSiteId, navigate]);

  useEffect(() => {
    if (!buildings) return;
    if (buildings.length === 0) {
      if (currentBuildingId) setCurrentBuilding(null);
      return;
    }
    if (
      currentBuildingId &&
      buildings.some((building) => building.id === currentBuildingId)
    ) {
      return;
    }
    setCurrentBuilding(asBuildingId(buildings[0].id));
  }, [buildings, currentBuildingId, setCurrentBuilding]);

  const sortedFloors: Array<Floor> = useMemo(
    () =>
      floors
        ? [...floors]
            .sort((a, b) => a.order - b.order)
            .map((floor) => ({
              ...floor,
              id: asFloorId(floor.id),
              buildingId: asBuildingId(floor.buildingId),
            }))
        : [],
    [floors],
  );

  useEffect(() => {
    if (!floors) return;
    if (currentFloorId && floors.some((floor) => floor.id === currentFloorId)) {
      return;
    }
    setCurrentFloor(sortedFloors[0]?.id ?? null);
  }, [floors, sortedFloors, currentFloorId, setCurrentFloor]);

  if (site === null) return <NoSite />;

  const isBootstrappingMap =
    buildings === undefined ||
    (currentBuildingId !== null && floors === undefined);

  return (
    <SidebarProvider>
      {isBootstrappingMap ? (
        <div className="h-screen w-screen bg-background" />
      ) : (
        <MapWorkspace sortedFloors={sortedFloors} />
      )}
    </SidebarProvider>
  );
}

function MapWorkspace({ sortedFloors }: { sortedFloors: Array<Floor> }) {
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const canEdit = useCanEdit();
  const isReady = useMapDocumentReady();
  const { commands, undo, redo, getDocument } = useMapDocumentActions();

  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);
  const toggleEditMode = useMapStore((s) => s.toggleEditMode);
  const selectDevice = useMapStore((s) => s.selectDevice);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const setHighlightedDevices = useMapStore((s) => s.setHighlightedDevices);
  const leaveEditTools = useMapStore((s) => s.leaveEditTools);

  // A draw tool or a multi-selection left on swallows device clicks, and a
  // user who cannot edit has no toolbar or shortcut to leave it, as when an
  // editor is made a reader mid-session.
  useEffect(() => {
    if (!canEdit) leaveEditTools();
  }, [canEdit, leaveEditTools]);

  const { theme, setTheme } = useTheme();

  const currentFloorIndex = sortedFloors.findIndex(
    (floor) => floor.id === currentFloorId,
  );

  const navigateFloorUp = () => {
    if (currentFloorIndex > 0) {
      setCurrentFloor(sortedFloors[currentFloorIndex - 1].id);
    }
  };

  const navigateFloorDown = () => {
    if (currentFloorIndex >= 0 && currentFloorIndex < sortedFloors.length - 1) {
      setCurrentFloor(sortedFloors[currentFloorIndex + 1].id);
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
    if (!selectedDeviceId || !isReady || !isEditMode) return;
    commands.deleteDevice(selectedDeviceId);
    selectDevice(null);
  };

  // Reads hover/highlight state lazily so the workspace does not re-render
  // on every pointer hover; it is only needed when the shortcut fires.
  const highlightConnections = () => {
    const { hoveredDeviceId, highlightedDeviceIds } = useMapStore.getState();
    const next = getNextConnectionHighlightIds({
      links: getDocument().links,
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
  useShortcutIntentEffect("unplace-device", () => {
    if (!selectedDeviceId || !isReady || !isEditMode) return;
    commands.unplaceDevice(selectedDeviceId);
    selectDevice(null);
  });
  useShortcutIntentEffect("highlight-connections", highlightConnections);
  useShortcutIntentEffect("escape", () => {
    const {
      activeDrawTool,
      isOverlayPanelOpen,
      overlayCalibration,
      setOverlayCalibration,
      setOverlayPanelOpen,
    } = useMapStore.getState();
    if (!isEditMode || activeDrawTool !== "device") return;
    if (overlayCalibration) setOverlayCalibration(null);
    else if (isOverlayPanelOpen) setOverlayPanelOpen(false);
    else toggleEditMode();
  });
  useShortcutIntentEffect("undo", () => {
    if (isEditMode && isReady) undo();
  });
  useShortcutIntentEffect("redo", () => {
    if (isEditMode && isReady) redo();
  });
  useShortcutIntentEffect("floor-up", navigateFloorUp);
  useShortcutIntentEffect("floor-down", navigateFloorDown);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <AppSidebar />

      <SidebarInset className="relative">
        <ReactFlowProvider>
          <FlowCanvas />
          <Toolbar />
          {selectedDeviceId ? <DeviceDrawer /> : null}
          <MapDocumentStatus />

          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            {canEdit ? (
              <button
                onClick={toggleEditMode}
                disabled={!currentFloorId || !isReady}
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
            ) : (
              <div
                className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-lg"
                title="Votre rôle permet de consulter le plan, pas de le modifier"
              >
                <HugeiconsIcon
                  icon={ViewIcon}
                  size={20}
                  color="currentColor"
                  strokeWidth={1.5}
                />
                Lecture seule
              </div>
            )}
          </div>
        </ReactFlowProvider>

        <ShortcutsDialog hasRightDrawerOpen={Boolean(selectedDeviceId)} />
      </SidebarInset>
    </div>
  );
}

function NoSite() {
  const me = useCurrentUser();
  const admin = me ? isAdmin(me.role) : false;
  // Without a site there is no sidebar, which holds the sign-out button.
  const { signingOut, signOut } = useSignOut();
  return (
    <main className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="text-lg font-semibold">Aucun site</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {admin
          ? "Créez un premier site pour commencer à dessiner son plan."
          : "Aucun site n'est encore configuré. Demandez à un administrateur d'en créer un."}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {admin ? (
          <Link to="/admin/sites" className={buttonVariants()}>
            Créer un site
          </Link>
        ) : null}
        <Button
          variant="outline"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          Se déconnecter
        </Button>
      </div>
    </main>
  );
}
