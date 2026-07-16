import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { NetBoxInventoryPanel } from "@/integrations/netbox/NetBoxInventoryPanel";
import {
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
  useSelectedDeviceIds,
  useSelectedWallColor,
} from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import { useMapDocumentReady } from "@/map-session/useMapDocument";
import { drawToolbarActions } from "@/panels/toolbar-actions";
import type { DrawToolbarAction } from "@/panels/toolbar-actions";
import type { DrawTool } from "@/types/map";

export default function Toolbar() {
  const currentFloorId = useCurrentFloorId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const selectedWallColor = useSelectedWallColor();
  const isReady = useMapDocumentReady();
  const isMultiSelectMode = useIsMultiSelectMode();
  const selectedDeviceIds = useSelectedDeviceIds();

  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const setSelectedWallColor = useMapStore(
    (state) => state.setSelectedWallColor,
  );
  const selectDevice = useMapStore((state) => state.selectDevice);
  const toggleMultiSelectMode = useMapStore(
    (state) => state.toggleMultiSelectMode,
  );
  const [flashType, setFlashType] = useState<"undo" | "redo" | null>(null);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const handler = (event: Event) => {
      const type = (event as CustomEvent<{ type: "undo" | "redo" }>).detail
        .type;
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
          "flex h-auto flex-col items-center px-2 py-1.5",
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
    <div className="fixed top-4 left-1/2 z-10 max-w-[calc(100vw-22rem)] -translate-x-1/2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg p-1 shadow-lg transition-colors duration-500",
          flashType === "undo"
            ? "bg-red-100 dark:bg-red-950"
            : flashType === "redo"
              ? "bg-blue-100 dark:bg-blue-950"
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
          Sélection
          {selectedDeviceIds.length > 1 ? (
            <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {selectedDeviceIds.length}
            </span>
          ) : null}
        </Button>

        <div className="h-6 w-px bg-border" aria-hidden />
        <div className="flex items-center gap-1">
          {drawToolbarActions.map((action) => renderToolbarAction(action))}
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
            <div className="h-6 w-px bg-border" aria-hidden />
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

        <div className="h-6 w-px bg-border" aria-hidden />
        <NetBoxInventoryPanel />
      </div>
    </div>
  );
}
