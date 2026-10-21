import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Edit01Icon,
  SidebarLeftIcon,
  Tick01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef } from "react";
import type { ComponentProps } from "react";
import { useQuery } from "convex/react";
import FlowCanvas from "@/canvas/FlowCanvas";
import { MapSkeleton } from "@/components/loading-skeletons";
import AppSidebar from "@/panels/Sidebar";
import { MapEmptyState } from "@/buildings/MapEmptyState";
import { StructureDialog } from "@/buildings/StructureDialog";
import Toolbar from "@/panels/Toolbar";
import DeviceDrawer from "@/panels/DeviceDrawer";
import { MapDocumentStatus } from "@/map-session/MapDocumentStatus";
import {
  useMapDocumentActions,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useConnectionStore } from "@/store/useConnectionStore";
import { useMapStore } from "@/store/useMapStore";
import {
  useCurrentBuildingId,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import type { Floor } from "@/types/map";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { useCanEdit, useCurrentUser } from "@/hooks/use-current-user";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSignOut } from "@/panels/SidebarAccount";
import { isAdmin } from "@/lib/roles";
import { mapSearch, useCurrentSite } from "@/sites/useCurrentSite";
import { SiteRefreshShortcut } from "@/sites/CollectionFreshness";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { MapFind } from "@/search/MapFind";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { toggledCableDisplay } from "@/canvas/cablePaths";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { api } from "../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/")({
  ssr: false,
  validateSearch: mapSearch,
  component: HomePage,
});

function HomePage() {
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

  useMapUrlSync();

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

  // Only once loaded, so the map never flashes empty while it opens a floor.
  const currentBuilding =
    buildings?.find((building) => building.id === currentBuildingId) ?? null;
  const currentFloor = sortedFloors.find(
    (floor) => floor.id === currentFloorId,
  );
  useDocumentTitle(
    currentFloor && currentBuilding
      ? `${currentFloor.name} · ${currentBuilding.name}`
      : (currentBuilding?.name ?? site?.name ?? null),
  );

  if (site === null) return <NoSite />;

  const isBootstrappingMap =
    buildings === undefined ||
    (currentBuildingId !== null && floors === undefined);

  const empty =
    site && buildings?.length === 0
      ? { siteId: site.id, building: null }
      : site && currentBuilding && floors?.length === 0
        ? { siteId: site.id, building: currentBuilding }
        : null;

  return (
    <SidebarProvider>
      {isBootstrappingMap ? (
        <MapSkeleton />
      ) : (
        <MapWorkspace sortedFloors={sortedFloors} empty={empty} />
      )}
    </SidebarProvider>
  );
}

function MapWorkspace({
  sortedFloors,
  empty,
}: {
  sortedFloors: Array<Floor>;
  empty: ComponentProps<typeof MapEmptyState> | null;
}) {
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const canEdit = useCanEdit();
  const me = useCurrentUser();
  const isReady = useMapDocumentReady();
  const { site } = useCurrentSite();
  const { commands, undo, redo, getDocument } = useMapDocumentActions();

  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);
  const toggleEditMode = useMapStore((s) => s.toggleEditMode);
  const selectDevice = useMapStore((s) => s.selectDevice);
  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const showCables = useMapStore((s) => s.showCables);
  const leaveEditTools = useMapStore((s) => s.leaveEditTools);

  // A draw tool or a multi-selection left on swallows device clicks, and a
  // user who cannot edit has no toolbar or shortcut to leave it, as when an
  // editor is made a reader mid-session.
  useEffect(() => {
    if (!canEdit) leaveEditTools();
  }, [canEdit, leaveEditTools]);

  const currentFloorIndex = sortedFloors.findIndex(
    (floor) => floor.id === currentFloorId,
  );

  // `sortedFloors` runs from the ground up: Ctrl+↑ climbs a floor.
  const navigateFloorUp = () => {
    if (currentFloorIndex >= 0 && currentFloorIndex < sortedFloors.length - 1) {
      setCurrentFloor(sortedFloors[currentFloorIndex + 1].id);
    }
  };

  const navigateFloorDown = () => {
    if (currentFloorIndex > 0) {
      setCurrentFloor(sortedFloors[currentFloorIndex - 1].id);
    }
  };

  const closeDrawer = () => {
    selectDevice(null);
    setActiveDrawTool("device");
    showCables(null);
  };

  const deleteSelectedDevice = () => {
    if (!selectedDeviceId || !isReady || !isEditMode) return;
    if (commands.deleteDevice(selectedDeviceId)) selectDevice(null);
  };

  // Reads hover state lazily so the workspace does not re-render on every
  // pointer hover; it is only needed when the shortcut fires.
  const toggleDeviceCables = () => {
    const { hoveredDeviceId, shownCablesDeviceId } = useMapStore.getState();
    const targetId = selectedDeviceId ?? hoveredDeviceId;
    const target = getDocument().devices.find(
      (device) => device.id === targetId,
    );
    showCables(toggledCableDisplay(shownCablesDeviceId, target));
  };

  // Frozen, the map keeps the user's choice for when the connection returns.
  const isMapFrozen = useConnectionStore((s) => s.isMapFrozen);
  const toggleEditModeIfLive = () => {
    if (!isMapFrozen) toggleEditMode();
  };

  useShortcutIntentEffect("toggle-edit-mode", toggleEditModeIfLive);
  // Escape abandons a cable being drawn before it closes anything else.
  const abandonCable = () => {
    const { cableDraft, setCableDraft } = useMapStore.getState();
    if (cableDraft) setCableDraft(null);
    return cableDraft !== null;
  };

  useShortcutIntentEffect("close-drawer", () => {
    if (!abandonCable()) closeDrawer();
  });
  useShortcutIntentEffect("delete-device", deleteSelectedDevice);
  useShortcutIntentEffect("unplace-device", () => {
    if (!selectedDeviceId || !isReady || !isEditMode) return;
    commands.unplaceDevice(selectedDeviceId);
    selectDevice(null);
  });
  useShortcutIntentEffect("toggle-device-cables", toggleDeviceCables);
  // Escape closes, abandons or deselects; it never leaves edit mode, which
  // "Terminer" and E do (ADR 0030).
  useShortcutIntentEffect("escape", () => {
    if (abandonCable()) return;
    const {
      activeDrawTool,
      isOverlayPanelOpen,
      isPlacePanelOpen,
      isLabelToolActive,
      setLabelToolActive,
      overlayCalibration,
      setOverlayCalibration,
      setOverlayPanelOpen,
      setPlacePanelOpen,
      setSelectedDevices,
      selectedDeviceIds,
      shownCablesDeviceId,
    } = useMapStore.getState();
    const isEditing = isEditMode && activeDrawTool === "device";
    if (isEditing && overlayCalibration) setOverlayCalibration(null);
    else if (isEditing && isOverlayPanelOpen) setOverlayPanelOpen(false);
    else if (isEditing && isPlacePanelOpen) setPlacePanelOpen(false);
    else if (isLabelToolActive) setLabelToolActive(false);
    else if (shownCablesDeviceId) showCables(null);
    else if (selectedDeviceIds.length > 0) setSelectedDevices([]);
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
          {/* The mode button and the toolbar come before the plan, so Tab
              reaches them first (ADR 0030). */}
          {/* Above the toolbar, which can reach it on a narrow screen. */}
          <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
            <SidebarToggle />
            {canEdit ? (
              <button
                onClick={toggleEditModeIfLive}
                // Without a floor, edit mode still holds the building's own
                // actions in the sidebar.
                disabled={isMapFrozen || (currentFloorId !== null && !isReady)}
                className={`relative flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium shadow-lg transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                  isEditMode
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-primary bg-primary text-primary-foreground"
                } `}
                title={
                  isMapFrozen
                    ? "Hors connexion : le plan est en lecture seule"
                    : isEditMode
                      ? "Terminer les modifications"
                      : "Modifier le plan"
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
                title={
                  me?.sso
                    ? "Votre rôle permet de consulter le plan, pas de le modifier. Il vient de Keycloak : demandez à un administrateur de vous en donner un autre."
                    : "Votre rôle permet de consulter le plan, pas de le modifier"
                }
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
          <Toolbar />
          <FlowCanvas />
          {selectedDeviceId ? <DeviceDrawer /> : null}
          {empty ? <MapEmptyState {...empty} /> : null}
          <MapDocumentStatus floorless={empty !== null} />
          {site ? <SiteRefreshShortcut siteId={site.id} /> : null}
          <MapFind hasRightDrawerOpen={Boolean(selectedDeviceId)} />
        </ReactFlowProvider>

        <ShortcutsDialog hasRightDrawerOpen={Boolean(selectedDeviceId)} />
        <StructureDialog />
      </SidebarInset>
    </div>
  );
}

/**
 * Keeps `?floor=` and `?device=` in step with the map, both ways, so a link
 * or a reload opens the same floor and device (ADR 0030). The URL is applied
 * only when it changes, and the map writes back only what differs, so the
 * two never fight.
 */
function useMapUrlSync() {
  const { floor, device } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const allFloors = useQuery(api.floors.listAll);
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const appliedRef = useRef<string | null>(null);

  // One effect, so the write-back also runs when the floors arrive after
  // the map was opened from elsewhere (the inventory, a search).
  useEffect(() => {
    if (!allFloors) return;
    const key = `${floor ?? ""}|${device ?? ""}`;
    if (appliedRef.current !== key) {
      appliedRef.current = key;
      applyUrl(allFloors, floor, device);
    }
    // Read now: applying the URL may have just changed the map.
    const state = useMapStore.getState();
    const nextFloor = state.currentFloorId ?? undefined;
    const nextDevice = state.selectedDeviceId ?? undefined;
    if (nextFloor === floor && nextDevice === device) return;
    appliedRef.current = `${nextFloor ?? ""}|${nextDevice ?? ""}`;
    void navigate({
      search: (previous) => ({
        site: previous.site,
        ...(nextFloor ? { floor: nextFloor } : {}),
        ...(nextDevice ? { device: nextDevice } : {}),
      }),
      replace: true,
    });
  }, [allFloors, floor, device, currentFloorId, selectedDeviceId, navigate]);
}

/**
 * Opens the floor and device a URL names, if the floor exists; a URL that
 * names a floor but no device leaves nothing selected.
 */
function applyUrl(
  allFloors: ReadonlyArray<{ id: string; buildingId: string }>,
  floor: string | undefined,
  device: string | undefined,
) {
  const target = allFloors.find((candidate) => candidate.id === floor);
  if (!target) return;
  const store = useMapStore.getState();
  const location = {
    buildingId: asBuildingId(target.buildingId),
    floorId: asFloorId(target.id),
  };
  if (device) {
    // A shared link to a device opens on it, not on the floor's last view.
    store.locateDevice(
      { ...location, deviceId: asDeviceId(device) },
      { select: true },
    );
    return;
  }
  if (store.currentBuildingId !== location.buildingId) {
    store.setCurrentBuilding(location.buildingId);
  }
  if (useMapStore.getState().currentFloorId !== location.floorId) {
    store.setCurrentFloor(location.floorId);
  }
  if (useMapStore.getState().selectedDeviceId !== null) {
    store.selectDevice(null);
  }
}

/** Folds the sidebar away and back, as Ctrl+B does; the choice is kept. */
function SidebarToggle() {
  const { isMobile, open, openMobile, toggleSidebar } = useSidebar();
  const shown = isMobile ? openMobile : open;
  const label = shown
    ? "Masquer le panneau latéral"
    : "Afficher le panneau latéral";
  return (
    <button
      type="button"
      data-sidebar="trigger"
      onClick={toggleSidebar}
      aria-label={label}
      aria-expanded={shown}
      title={label}
      className="relative flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-lg transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
    >
      <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.5} />
      <ShortcutHintAbsolute action="sidebar-toggle" position="bottom-right" />
    </button>
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
