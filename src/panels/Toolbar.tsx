import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlignBottomIcon,
  AlignHorizontalCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignSelectionIcon,
  AlignTopIcon,
  AlignVerticalCenterIcon,
  Layers01Icon,
  PackageIcon,
  TextIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignVerticalDistributeCenterIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSelectionMoves } from "@/canvas/hooks/useSelectionCommands";
import type { Alignment } from "@/canvas/arrangement";
import { Button } from "@/components/ui/button";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import {
  TOOLBAR_ICON_SIZE_CLASS,
  TOOLBAR_WALL_COLOR_SELECTION_ENABLED,
  UNDO_REDO_EVENT_NAME,
  UNDO_REDO_FLASH_DURATION_MS,
} from "@/lib/constants";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";
import { WALL_COLOR_ORDER, WALL_COLOR_TONES } from "@/lib/walls";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useIsMultiSelectMode,
  useIsOverlayPanelOpen,
  useIsLabelToolActive,
  useIsPlacePanelOpen,
  useSelectedDeviceIds,
  useSelectedWallColor,
} from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import { useMapDocumentReady } from "@/map-session/useMapDocument";
import { drawToolbarActions } from "@/panels/toolbar-actions";
import type { DrawToolbarAction } from "@/panels/toolbar-actions";
import type { DrawTool } from "@/types/map";
import type { MapFlash } from "@/map-session/history";

export default function Toolbar() {
  const currentFloorId = useCurrentFloorId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const selectedWallColor = useSelectedWallColor();
  const isReady = useMapDocumentReady();
  const isMultiSelectMode = useIsMultiSelectMode();
  const selectedDeviceIds = useSelectedDeviceIds();
  const isOverlayPanelOpen = useIsOverlayPanelOpen();

  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const setSelectedWallColor = useMapStore(
    (state) => state.setSelectedWallColor,
  );
  const selectDevice = useMapStore((state) => state.selectDevice);
  const toggleMultiSelectMode = useMapStore(
    (state) => state.toggleMultiSelectMode,
  );
  const setOverlayPanelOpen = useMapStore((state) => state.setOverlayPanelOpen);
  const isPlacePanelOpen = useIsPlacePanelOpen();
  const setPlacePanelOpen = useMapStore((state) => state.setPlacePanelOpen);
  const [flashType, setFlashType] = useState<MapFlash | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = (event: Event) => {
      const type = (event as CustomEvent<{ type: MapFlash }>).detail.type;
      setFlashType(type);
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(
        () => setFlashType(null),
        UNDO_REDO_FLASH_DURATION_MS,
      );
    };
    window.addEventListener(UNDO_REDO_EVENT_NAME, handler);
    return () => {
      window.removeEventListener(UNDO_REDO_EVENT_NAME, handler);
      if (timeout !== null) clearTimeout(timeout);
    };
  }, []);

  const handleDrawToolClick = (
    tool: Extract<DrawTool, "wall" | "wall-brush" | "wall-erase" | "room">,
  ) => {
    if (!currentFloorId || !isReady) return;
    if (isMultiSelectMode) toggleMultiSelectMode();
    setActiveDrawTool(activeDrawTool === tool ? "device" : tool);
    selectDevice(null);
  };

  useShortcutIntentEffect("tool-wall", () => handleDrawToolClick("wall"));
  useShortcutIntentEffect("tool-wall-erase", () =>
    handleDrawToolClick("wall-erase"),
  );
  useShortcutIntentEffect("tool-wall-brush", () =>
    handleDrawToolClick("wall-brush"),
  );
  useShortcutIntentEffect("tool-room", () => handleDrawToolClick("room"));

  const isLabelToolActive = useIsLabelToolActive();
  const setLabelToolActive = useMapStore((state) => state.setLabelToolActive);
  const toggleLabelTool = () => {
    if (!currentFloorId || !isReady) return;
    setLabelToolActive(!isLabelToolActive);
    selectDevice(null);
  };
  useShortcutIntentEffect("tool-label", toggleLabelTool);

  const toggleOverlayPanel = () => {
    if (!currentFloorId) return;
    setOverlayPanelOpen(!isOverlayPanelOpen);
  };
  useShortcutIntentEffect("toggle-overlay-panel", toggleOverlayPanel);

  const togglePlacePanel = () => {
    if (!currentFloorId || !isReady) return;
    setPlacePanelOpen(!isPlacePanelOpen);
  };
  useShortcutIntentEffect("place-device", togglePlacePanel);

  if (!isEditMode) return null;

  const showWallColors =
    activeDrawTool === "wall" ||
    activeDrawTool === "wall-brush" ||
    activeDrawTool === "wall-erase" ||
    activeDrawTool === "room";

  const renderToolbarAction = (action: DrawToolbarAction) => {
    const isActive = activeDrawTool === action.tool;
    const isEraseAction = action.tool === "wall-erase";
    const button = (
      <Button
        variant={isEraseAction ? "ghost" : isActive ? "secondary" : "ghost"}
        size="sm"
        onClick={() => handleDrawToolClick(action.tool)}
        disabled={!currentFloorId || !isReady}
        className={cn(
          "flex h-auto flex-col items-center px-2 py-1.5 @max-[52rem]:px-1",
          isActive && !isEraseAction && "ring-2 ring-ring",
          isEraseAction && isActive && "text-destructive",
          isEraseAction && !isActive && "hover:text-destructive",
        )}
        title={action.title}
      >
        {action.icon}
      </Button>
    );

    return (
      <div key={action.id} className="relative">
        {button}
        <ShortcutHintAbsolute
          action={action.shortcut}
          position="bottom-center"
        />
      </div>
    );
  };

  return (
    // Labels give way to icons alone when the bar runs short (A56).
    <div className="pointer-events-auto max-w-full">
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-1 rounded-lg border border-border p-1 shadow-lg transition-colors duration-500 @min-[52rem]:gap-2",
          // Undo and redo flash neutral; only a refusal is red (A19).
          flashType === "refused"
            ? "bg-down-background"
            : flashType
              ? "bg-accent"
              : "bg-card",
        )}
      >
        <Button
          type="button"
          variant={isMultiSelectMode ? "secondary" : "ghost"}
          size="sm"
          onClick={toggleMultiSelectMode}
          disabled={!currentFloorId || !isReady}
          className={cn("gap-2", isMultiSelectMode && "ring-2 ring-ring")}
          title="Sélectionner et déplacer plusieurs équipements"
        >
          <span className="size-4 rounded border border-dashed border-current" />
          <span className="@max-[52rem]:sr-only">Sélection</span>
          {selectedDeviceIds.length > 1 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {selectedDeviceIds.length}
            </span>
          ) : null}
        </Button>

        {selectedDeviceIds.length > 1 ? (
          <ArrangeMenu count={selectedDeviceIds.length} />
        ) : null}

        <div className="h-6 w-px bg-border @max-[52rem]:hidden" aria-hidden />
        <div className="flex items-center gap-1">
          {drawToolbarActions.map((action) => renderToolbarAction(action))}
          <div className="relative">
            <Button
              variant={isLabelToolActive ? "secondary" : "ghost"}
              size="sm"
              onClick={toggleLabelTool}
              disabled={!currentFloorId || !isReady}
              aria-pressed={isLabelToolActive}
              className={cn(
                "flex h-auto flex-col items-center px-2 py-1.5",
                isLabelToolActive && "ring-2 ring-ring",
              )}
              title="Poser une étiquette de texte"
              aria-label="Poser une étiquette de texte"
            >
              <HugeiconsIcon
                icon={TextIcon}
                className={TOOLBAR_ICON_SIZE_CLASS}
                strokeWidth={1.5}
              />
            </Button>
            <ShortcutHintAbsolute
              action="tool-label"
              position="bottom-center"
            />
          </div>
        </div>

        {showWallColors ? (
          <div
            className={cn(
              "flex items-center gap-1",
              // eslint-disable-next-line
              TOOLBAR_WALL_COLOR_SELECTION_ENABLED ? "" : "hidden",
            )}
            aria-hidden={!TOOLBAR_WALL_COLOR_SELECTION_ENABLED}
          >
            <div
              className="h-6 w-px bg-border @max-[52rem]:hidden"
              aria-hidden
            />
            {WALL_COLOR_ORDER.map((color) => {
              const tone = WALL_COLOR_TONES[color];
              const isActive = selectedWallColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedWallColor(color)}
                  disabled={
                    !currentFloorId ||
                    !isReady ||
                    !TOOLBAR_WALL_COLOR_SELECTION_ENABLED
                  }
                  className={cn(
                    "h-6 w-6 rounded-full ring-ring transition-all",
                    isActive && "ring-offset-0.5 ring-2 ring-muted-foreground",
                  )}
                  style={{
                    backgroundColor: tone.fill,
                    borderColor: tone.stroke,
                  }}
                  title={`Couleur mur: ${tone.label}`}
                />
              );
            })}
          </div>
        ) : null}

        <div className="h-6 w-px bg-border @max-[52rem]:hidden" aria-hidden />
        <div className="relative">
          <Button
            type="button"
            variant={isPlacePanelOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={togglePlacePanel}
            disabled={!currentFloorId || !isReady}
            aria-pressed={isPlacePanelOpen}
            className={cn("gap-2", isPlacePanelOpen && "ring-2 ring-ring")}
            title="Placer sur l'étage un équipement de l'inventaire"
          >
            <HugeiconsIcon icon={PackageIcon} strokeWidth={2} />
            <span className="@max-[52rem]:sr-only">Placer</span>
          </Button>
          <ShortcutHintAbsolute
            action="place-device"
            position="bottom-center"
          />
        </div>
        <div className="relative">
          <Button
            type="button"
            variant={isOverlayPanelOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={toggleOverlayPanel}
            disabled={!currentFloorId}
            aria-pressed={isOverlayPanelOpen}
            className={cn("gap-2", isOverlayPanelOpen && "ring-2 ring-ring")}
            title="Importer et régler le plan affiché sous l'étage"
          >
            <HugeiconsIcon icon={Layers01Icon} strokeWidth={2} />
            <span className="@max-[52rem]:sr-only">Calque</span>
          </Button>
          <ShortcutHintAbsolute
            action="toggle-overlay-panel"
            position="bottom-center"
          />
        </div>
      </div>
    </div>
  );
}

const ALIGNMENTS: Array<{
  alignment: Alignment;
  label: string;
  icon: IconSvgElement;
}> = [
  { alignment: "left", label: "Aligner à gauche", icon: AlignLeftIcon },
  {
    alignment: "center-x",
    label: "Centrer horizontalement",
    icon: AlignHorizontalCenterIcon,
  },
  { alignment: "right", label: "Aligner à droite", icon: AlignRightIcon },
  { alignment: "top", label: "Aligner en haut", icon: AlignTopIcon },
  {
    alignment: "center-y",
    label: "Centrer verticalement",
    icon: AlignVerticalCenterIcon,
  },
  { alignment: "bottom", label: "Aligner en bas", icon: AlignBottomIcon },
];

/** Aligns or spreads a selection of several devices (C3). */
function ArrangeMenu({ count }: { count: number }) {
  const { align, distribute } = useSelectionMoves();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
        className="gap-2"
        title="Aligner ou répartir la sélection"
      >
        <HugeiconsIcon icon={AlignSelectionIcon} strokeWidth={2} />
        <span className="@max-[52rem]:sr-only">Aligner</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-56">
        {ALIGNMENTS.map(({ alignment, label, icon }) => (
          <DropdownMenuItem key={alignment} onClick={() => align(alignment)}>
            <HugeiconsIcon icon={icon} strokeWidth={1.5} />
            {label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={count < 3}
          onClick={() => distribute("horizontal")}
        >
          <HugeiconsIcon
            icon={AlignHorizontalDistributeCenterIcon}
            strokeWidth={1.5}
          />
          Répartir horizontalement
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={count < 3}
          onClick={() => distribute("vertical")}
        >
          <HugeiconsIcon
            icon={AlignVerticalDistributeCenterIcon}
            strokeWidth={1.5}
          />
          Répartir verticalement
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
