import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Building05Icon,
  DashedLine01Icon,
  PackageIcon,
  WorkHistoryIcon,
  RedoIcon,
  SolidLine01Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useMapStore } from "@/store/useMapStore";
import {
  useCurrentBuildingId,
  useCurrentFloorId,
  useIsEditMode,
} from "@/store/selectors";
import { useOptionHeld } from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";
import { getShortcutDisplay } from "@/lib/shortcuts";
import { asBuildingId, asFloorId } from "@/lib/objectIds";
import { useTemporalStore, useUndoRedo } from "@/hooks/use-undo-redo";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { NetplanLogo } from "@/components/netplan-logo";
import { UserAvatarStack } from "@/components/user-avatar";
import { usePresence } from "@/hooks/use-presence";
import { sortPresences } from "@/lib/presence";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { StructureMenu } from "@/buildings/StructureMenu";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import { SidebarAccount } from "@/panels/SidebarAccount";
import { CollectionFreshness } from "@/sites/CollectionFreshness";
import { OfflineDevices } from "@/sites/OfflineDevices";
import { SiteSwitcher } from "@/sites/SiteSwitcher";
import { useCurrentSite } from "@/sites/useCurrentSite";
import { useCanEdit } from "@/hooks/use-current-user";
import { api } from "../../convex/_generated/api";

/**
 * Isolated so holding the shortcut modifier key (Ctrl/Cmd — pressed for
 * every undo/redo) only re-renders this hint, not the whole sidebar.
 */
function SidebarFloorShortcutHint() {
  const { isVisible: isModifierVisible } = useOptionHeld();

  const floorUpKeys = getShortcutDisplay("floor-up")[0] ?? [];
  const floorDownKeys = getShortcutDisplay("floor-down")[0] ?? [];
  const sharedFloorModifier =
    floorUpKeys.length > 1 &&
    floorDownKeys.length > 1 &&
    floorUpKeys[0] === floorDownKeys[0]
      ? floorUpKeys[0]
      : null;
  const floorUpArrow = floorUpKeys.at(-1) ?? "↑";
  const floorDownArrow = floorDownKeys.at(-1) ?? "↓";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground transition-opacity duration-200",
        isModifierVisible ? "opacity-100" : "opacity-0",
      )}
    >
      <KbdGroup>
        {sharedFloorModifier ? <Kbd>{sharedFloorModifier}</Kbd> : null}
        <Kbd>{floorUpArrow}</Kbd>
      </KbdGroup>
      <span>/</span>
      <KbdGroup>
        <Kbd>{floorDownArrow}</Kbd>
      </KbdGroup>
    </div>
  );
}

/**
 * Isolated so undo/redo history changes only re-render these two buttons,
 * not the whole sidebar (buildings, floors, connected users).
 */
function SidebarUndoRedo() {
  const isEditMode = useIsEditMode();
  const { handleUndo, handleRedo } = useUndoRedo();
  const canUndo = useTemporalStore((s) => s.pastStates.length > 0);
  const canRedo = useTemporalStore((s) => s.futureStates.length > 0);

  return (
    <div className={`border-t ${isEditMode ? "" : "hidden"}`}>
      <div className="flex h-10 w-full">
        <button
          type="button"
          onClick={handleUndo}
          disabled={!isEditMode || !canUndo}
          className="group flex h-full flex-1 items-center justify-center border-0 border-r border-border text-xs text-sidebar-foreground transition-[background-color,color,box-shadow] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset active:bg-sidebar-accent active:text-sidebar-accent-foreground active:shadow-[inset_0_1px_2px_var(--color-border)] disabled:pointer-events-none disabled:opacity-50"
          title="Annuler (Ctrl+Z)"
        >
          <span className="flex items-center gap-1.5 transition-transform duration-75">
            <HugeiconsIcon icon={UndoIcon} size={14} strokeWidth={1.5} />
            Annuler
          </span>
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!isEditMode || !canRedo}
          className="group flex h-full flex-1 items-center justify-center text-xs text-sidebar-foreground transition-[background-color,color,box-shadow] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset active:bg-sidebar-accent active:text-sidebar-accent-foreground active:shadow-[inset_0_1px_2px_var(--color-border)] disabled:pointer-events-none disabled:opacity-50"
          title="Rétablir (Ctrl+Shift+Z)"
        >
          <span className="flex items-center gap-1.5 transition-transform duration-75">
            Rétablir
            <HugeiconsIcon icon={RedoIcon} size={14} strokeWidth={1.5} />
          </span>
        </button>
      </div>
    </div>
  );
}

export default function AppSidebar() {
  const { site } = useCurrentSite();
  const canEdit = useCanEdit();
  const buildings =
    useQuery(api.buildings.listForSite, site ? { siteId: site.id } : "skip") ??
    [];
  const currentBuildingId = useCurrentBuildingId();
  const currentFloorId = useCurrentFloorId();
  const presences = usePresence(currentFloorId);
  const allFloors = useQuery(api.floors.listAll) ?? [];
  const buildingIdByFloor = new Map(
    allFloors.map((floor) => [floor.id, floor.buildingId]),
  );

  const setCurrentBuilding = useMapStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);
  const floorsForCurrent = useQuery(
    api.floors.listForBuilding,
    currentBuildingId ? { buildingId: currentBuildingId } : "skip",
  );

  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);
  const sortedFloors = floorsForCurrent
    ? [...floorsForCurrent].sort((a, b) => a.order - b.order)
    : [];
  const isEditMode = useIsEditMode();
  const openStructureDialog = useStructureDialog((state) => state.open);

  return (
    <Sidebar collapsible="none" className="border-r">
      <SidebarHeader className="border-b py-4 pr-4 pl-0.5">
        <div className="flex items-center justify-between">
          <h1 className="rounded-sm bg-transparent pb-0.5 leading-none">
            <Link to="/" aria-label="Retour à l'accueil">
              <NetplanLogo size={34} />
            </Link>
          </h1>
          <ModeToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Site</SidebarGroupLabel>
          <SidebarGroupContent className="flex flex-col gap-1">
            <SiteSwitcher />
            {site ? (
              <CollectionFreshness
                siteId={site.id}
                withShortcut
                className="px-2 py-1"
              />
            ) : null}
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      to="/inventory"
                      search={site ? { site: site.id } : {}}
                    />
                  }
                >
                  <HugeiconsIcon
                    icon={PackageIcon}
                    size={16}
                    strokeWidth={1.5}
                  />
                  Inventaire
                </SidebarMenuButton>
              </SidebarMenuItem>
              {canEdit ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={
                      <Link
                        to="/history"
                        search={site ? { site: site.id } : {}}
                      />
                    }
                  >
                    <HugeiconsIcon
                      icon={WorkHistoryIcon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    Historique
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="px-0">Bâtiments</SidebarGroupLabel>
            <div className="flex items-center gap-1">
              <SidebarFloorShortcutHint />
              {isEditMode && site ? (
                <button
                  type="button"
                  onClick={() =>
                    openStructureDialog({
                      kind: "create-building",
                      siteId: site.id,
                    })
                  }
                  className="flex size-5 items-center justify-center rounded-md text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
                  title="Nouveau bâtiment"
                  aria-label="Nouveau bâtiment"
                >
                  <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} />
                </button>
              ) : null}
            </div>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {buildings.map((building) => {
                const isCurrentBuilding = building.id === currentBuildingId;
                const buildingPresences = sortPresences(
                  presences.filter(
                    (presence) =>
                      buildingIdByFloor.get(presence.floorId) === building.id,
                  ),
                );

                return (
                  <SidebarMenuItem key={building.id}>
                    <SidebarMenuButton
                      onClick={() =>
                        setCurrentBuilding(asBuildingId(building.id))
                      }
                      className={cn(
                        "cursor-pointer",
                        isCurrentBuilding && "font-medium text-foreground",
                      )}
                    >
                      <HugeiconsIcon
                        icon={Building05Icon}
                        size={16}
                        strokeWidth={1.5}
                      />
                      <span>{building.name}</span>
                      {!isCurrentBuilding && buildingPresences.length > 0 ? (
                        <UserAvatarStack
                          users={buildingPresences}
                          max={3}
                          size="sm"
                          className="ml-auto"
                        />
                      ) : null}
                    </SidebarMenuButton>
                    {isEditMode ? (
                      <StructureMenu
                        target="building"
                        id={building.id}
                        name={building.name}
                        trigger={<SidebarMenuAction />}
                      />
                    ) : null}

                    {isCurrentBuilding && sortedFloors.length > 0 ? (
                      <SidebarMenuSub>
                        {sortedFloors.map((floor) => {
                          const isActive = floor.id === currentFloorId;
                          const floorPresences = sortPresences(
                            presences.filter(
                              (presence) => presence.floorId === floor.id,
                            ),
                          );

                          return (
                            <SidebarMenuSubItem key={floor.id}>
                              <SidebarMenuSubButton
                                onClick={() =>
                                  setCurrentFloor(asFloorId(floor.id))
                                }
                                className={cn(
                                  "cursor-pointer justify-between",
                                  isEditMode && "pr-8",
                                  isActive &&
                                    "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2">
                                  <HugeiconsIcon
                                    icon={
                                      isActive
                                        ? SolidLine01Icon
                                        : DashedLine01Icon
                                    }
                                    size={16}
                                    strokeWidth={1}
                                  />
                                  <span className="truncate">{floor.name}</span>
                                </span>
                                {floorPresences.length > 0 ? (
                                  <UserAvatarStack
                                    users={floorPresences}
                                    max={3}
                                    size="sm"
                                  />
                                ) : null}
                              </SidebarMenuSubButton>
                              {isEditMode ? (
                                <StructureMenu
                                  target="floor"
                                  id={floor.id}
                                  name={floor.name}
                                  trigger={
                                    <button
                                      type="button"
                                      className={cn(
                                        "absolute top-0.5 right-1 flex size-6 items-center justify-center rounded-md ring-sidebar-ring outline-hidden focus-visible:ring-2",
                                        isActive
                                          ? "text-primary-foreground hover:bg-primary"
                                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                                      )}
                                    />
                                  }
                                />
                              ) : null}
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {site ? <OfflineDevices siteId={site.id} /> : null}
      </SidebarContent>

      <SidebarUndoRedo />

      <SidebarFooter className="border-t px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs text-muted-foreground">
            {currentBuilding?.name ?? "Aucun bâtiment"}
          </div>
        </div>
        <SidebarAccount />
      </SidebarFooter>
    </Sidebar>
  );
}
