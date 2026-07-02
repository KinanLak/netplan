import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building05Icon,
  DashedLine01Icon,
  RedoIcon,
  SolidLine01Icon,
  UndoIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { ConnectedUsers } from "@/panels/ConnectedUsers";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
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
  const buildings = useQuery(api.buildings.list) ?? [];
  const currentBuildingId = useCurrentBuildingId();
  const currentFloorId = useCurrentFloorId();

  const setCurrentBuilding = useMapStore((s) => s.setCurrentBuilding);
  const setCurrentFloor = useMapStore((s) => s.setCurrentFloor);
  const createDefaultMap = useMutation(api.buildings.createDefaultMap);
  const clearMap = useMutation(api.buildings.clearMap);
  const [devMapAction, setDevMapAction] = useState<"clear" | "create" | null>(
    null,
  );

  const floorsForCurrent = useQuery(
    api.floors.listForBuilding,
    currentBuildingId ? { buildingId: currentBuildingId } : "skip",
  );

  const currentBuilding = buildings.find((b) => b.id === currentBuildingId);
  const sortedFloors = floorsForCurrent
    ? [...floorsForCurrent].sort((a, b) => a.order - b.order)
    : [];
  const showDevMapControls = import.meta.env.DEV || buildings.length === 0;

  const handleCreateDefaultMap = async () => {
    setDevMapAction("create");
    try {
      const result = await createDefaultMap();
      setCurrentBuilding(asBuildingId(result.buildingId));
      const firstFloorId = result.floorIds[0];
      if (firstFloorId) setCurrentFloor(asFloorId(firstFloorId));
    } finally {
      setDevMapAction(null);
    }
  };

  const handleClearMap = async () => {
    const confirmed = window.confirm(
      "Supprimer temporairement toute la carte de développement ?",
    );
    if (!confirmed) return;

    setDevMapAction("clear");
    try {
      await clearMap();
      setCurrentBuilding(null);
    } finally {
      setDevMapAction(null);
    }
  };

  return (
    <Sidebar collapsible="none" className="border-r">
      <SidebarHeader className="border-b py-4 pr-4 pl-0.5">
        <div className="flex items-center justify-between">
          <h1 className="rounded-sm bg-transparent pb-0.5 leading-none">
            <Link to="/" aria-label="Retour a l'accueil">
              <NetplanLogo size={34} />
            </Link>
          </h1>
          <ModeToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2">
            <SidebarGroupLabel className="px-0">Bâtiments</SidebarGroupLabel>
            <SidebarFloorShortcutHint />
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {buildings.map((building) => (
                <SidebarMenuItem key={building.id}>
                  <SidebarMenuButton
                    onClick={() =>
                      setCurrentBuilding(asBuildingId(building.id))
                    }
                    className={cn(
                      "cursor-pointer",
                      building.id === currentBuildingId &&
                        "font-medium text-foreground",
                    )}
                  >
                    <HugeiconsIcon
                      icon={Building05Icon}
                      size={16}
                      strokeWidth={1.5}
                    />
                    <span>{building.name}</span>
                  </SidebarMenuButton>

                  {building.id === currentBuildingId ? (
                    <SidebarMenuSub>
                      {sortedFloors.map((floor) => {
                        const isActive = floor.id === currentFloorId;

                        return (
                          <SidebarMenuSubItem key={floor.id}>
                            <SidebarMenuSubButton
                              onClick={() =>
                                setCurrentFloor(asFloorId(floor.id))
                              }
                              className={cn(
                                "cursor-pointer justify-between",
                                isActive &&
                                  "bg-primary font-semibold text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <HugeiconsIcon
                                  icon={
                                    isActive
                                      ? SolidLine01Icon
                                      : DashedLine01Icon
                                  }
                                  size={16}
                                  strokeWidth={1}
                                />
                                <span>{floor.name}</span>
                              </span>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarUndoRedo />

      <ConnectedUsers floorId={currentFloorId} />

      <SidebarFooter className="border-t px-4 py-3">
        {showDevMapControls ? (
          <div className="mb-3 space-y-2 rounded-md border border-dashed border-border bg-muted p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCreateDefaultMap}
                disabled={devMapAction !== null}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                {devMapAction === "create"
                  ? "Création..."
                  : "Create default map"}
              </button>
              <button
                type="button"
                onClick={handleClearMap}
                disabled={devMapAction !== null}
                className="hover:text-destructive-foreground rounded-md border border-destructive bg-background px-2 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive disabled:pointer-events-none disabled:opacity-50"
              >
                {devMapAction === "clear" ? "Suppression..." : "Clear map"}
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-xs text-muted-foreground">
            {currentBuilding?.name ?? "Aucun bâtiment"}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
