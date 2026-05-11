import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";
import type { DeviceType, DrawTool } from "@/types/map";
import { useDevicePlacement } from "@/devices/useDevicePlacement";
import type { AvailableDevice } from "@/mock/availableDevices";
import type { ToolbarAction } from "@/panels/toolbar-actions";
import { useMapStore } from "@/store/useMapStore";
import { useMapCommands } from "@/store/useMapCommands";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedWallColor,
} from "@/store/selectors";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { createDeviceKindRecord } from "@/devices/deviceKindRegistry";
import { useDeviceToolShortcuts } from "@/devices/useDeviceToolShortcuts";
import { cn } from "@/lib/utils";
import { availableDevicesCatalog } from "@/mock/availableDevices";
import {
  TOOLBAR_WALL_COLOR_SELECTION_ENABLED,
  UNDO_REDO_EVENT_NAME,
  UNDO_REDO_FLASH_DURATION_MS,
} from "@/lib/constants";
import { WALL_COLOR_ORDER, WALL_COLOR_TONES } from "@/lib/walls";
import {
  deviceToolbarActions,
  drawToolbarActions,
} from "@/panels/toolbar-actions";

export default function Toolbar() {
  const currentFloorId = useCurrentFloorId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const selectedWallColor = useSelectedWallColor();

  const setActiveDrawTool = useMapStore((s) => s.setActiveDrawTool);
  const setSelectedWallColor = useMapStore((s) => s.setSelectedWallColor);
  const selectDevice = useMapStore((s) => s.selectDevice);
  const commands = useMapCommands(currentFloorId);
  const { addDevice, checkCollision } = commands;
  const devicePlacement = useDevicePlacement(checkCollision);
  const reactFlow = useReactFlow();
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [lastSelectedType, setLastSelectedType] = useState<DeviceType | null>(
    null,
  );
  const [activeAnchorElement, setActiveAnchorElement] =
    useState<HTMLButtonElement | null>(null);
  const [flashType, setFlashType] = useState<"undo" | "redo" | null>(null);
  const suppressNextTypeToggleRef = useRef<DeviceType | null>(null);

  // Listen for undo/redo events and flash the toolbar background
  useEffect(() => {
    const handler = (e: Event) => {
      const type = (e as CustomEvent<{ type: "undo" | "redo" }>).detail.type;
      setFlashType(type);
      const timeout = setTimeout(
        () => setFlashType(null),
        UNDO_REDO_FLASH_DURATION_MS,
      );
      return () => clearTimeout(timeout);
    };
    window.addEventListener(UNDO_REDO_EVENT_NAME, handler);
    return () => window.removeEventListener(UNDO_REDO_EVENT_NAME, handler);
  }, []);

  // Track button elements in a ref to avoid toolbar re-renders during mount.
  const buttonElementsRef = useRef<
    Record<DeviceType, HTMLButtonElement | null>
  >(createDeviceKindRecord(() => null));

  const handleTypeClick = (type: DeviceType) => {
    if (suppressNextTypeToggleRef.current) {
      const suppressedType = suppressNextTypeToggleRef.current;
      suppressNextTypeToggleRef.current = null;

      if (suppressedType === type) {
        return;
      }
    }

    const nextType = selectedType === type ? null : type;
    const nextAnchorElement = nextType
      ? buttonElementsRef.current[nextType]
      : activeAnchorElement;

    setActiveDrawTool("device");
    selectDevice(null);
    setSelectedType(nextType);
    if (nextType) {
      setLastSelectedType(nextType);
      setSearchQuery("");
    }
    setActiveAnchorElement(nextAnchorElement);
    setOpen(nextType !== null);
  };

  const handleDrawToolClick = (
    tool: Extract<DrawTool, "wall" | "wall-brush" | "wall-erase" | "room">,
  ) => {
    if (!currentFloorId) return;

    const nextTool = activeDrawTool === tool ? "device" : tool;
    setActiveDrawTool(nextTool);
    selectDevice(null);
    setSelectedType(null);
    setOpen(false);
  };

  const handleSelectWallColor = (color: typeof selectedWallColor) => {
    setSelectedWallColor(color);
  };

  const handleOpenChange: NonNullable<
    ComponentProps<typeof Popover>["onOpenChange"]
  > = (newOpen, eventDetails) => {
    const target = eventDetails.event.target;
    const isActiveButtonOutsidePress =
      !newOpen &&
      eventDetails.reason === "outside-press" &&
      target instanceof Node &&
      activeAnchorElement?.contains(target);

    if (isActiveButtonOutsidePress) {
      suppressNextTypeToggleRef.current = selectedType;
    }

    setOpen(newOpen);
    if (!newOpen) {
      setSelectedType(null);
    }
  };

  // Register keyboard shortcut handlers
  useShortcutIntentEffect("tool-wall", () => handleDrawToolClick("wall"));
  useShortcutIntentEffect("tool-wall-erase", () =>
    handleDrawToolClick("wall-erase"),
  );
  useShortcutIntentEffect("tool-wall-brush", () =>
    handleDrawToolClick("wall-brush"),
  );
  useShortcutIntentEffect("tool-room", () => handleDrawToolClick("room"));
  useDeviceToolShortcuts({
    enabled: true,
    onSelectDeviceType: handleTypeClick,
  });

  const handleAddDevice = (catalogDevice: AvailableDevice) => {
    if (!currentFloorId || !commands.isReady) return;

    // Get center of viewport
    const { x, y, zoom } = reactFlow.getViewport();
    const centerX = (-x + window.innerWidth / 2) / zoom;
    const centerY = (-y + window.innerHeight / 2) / zoom;

    const placement = devicePlacement.resolve({
      kind: "add",
      floorId: currentFloorId,
      requestedPosition: { x: centerX, y: centerY },
      size: catalogDevice.size,
    });

    if (!placement.ok) {
      return;
    }

    const newDevice = {
      type: catalogDevice.type,
      name: catalogDevice.name,
      hostname: catalogDevice.hostname,
      floorId: currentFloorId,
      size: catalogDevice.size,
      metadata: {
        ...catalogDevice.metadata,
        ip: catalogDevice.ip,
      },
      position: placement.position,
    };

    addDevice(newDevice);
    setActiveDrawTool("device");
    setSelectedType(null);
    setOpen(false);
  };

  // Filter devices based on search query
  const visibleDeviceType = selectedType ?? lastSelectedType;
  const availableDevices =
    activeDrawTool === "device" && visibleDeviceType
      ? availableDevicesCatalog[visibleDeviceType]
      : [];
  const filteredDevices = !searchQuery.trim()
    ? availableDevices
    : availableDevices.filter((device) => {
        const query = searchQuery.toLowerCase();
        return (
          device.name.toLowerCase().includes(query) ||
          device.model?.toLowerCase().includes(query) ||
          device.hostname?.toLowerCase().includes(query)
        );
      });

  if (!isEditMode) {
    return null;
  }

  const showWallColors =
    activeDrawTool === "wall" ||
    activeDrawTool === "wall-brush" ||
    activeDrawTool === "wall-erase" ||
    activeDrawTool === "room";
  const wallColorSelectionEnabled = TOOLBAR_WALL_COLOR_SELECTION_ENABLED;
  const isActionActive = (action: ToolbarAction) => {
    if (action.group === "draw") {
      return activeDrawTool === action.tool;
    }

    return selectedType === action.type && activeDrawTool === "device";
  };

  const handleToolbarActionClick = (action: ToolbarAction) => {
    if (action.group === "draw") {
      handleDrawToolClick(action.tool);
      return;
    }

    handleTypeClick(action.type);
  };

  const renderToolbarAction = (action: ToolbarAction) => {
    const isActive = isActionActive(action);
    const isEraseAction =
      action.group === "draw" && action.tool === "wall-erase";
    const isEraseActive = isEraseAction && isActive;

    const button = (
      <Button
        ref={
          action.group === "device"
            ? (el: HTMLButtonElement | null) => {
                buttonElementsRef.current[action.type] = el;
              }
            : undefined
        }
        variant={isEraseActive ? "ghost" : isActive ? "secondary" : "ghost"}
        size="sm"
        onClick={() => handleToolbarActionClick(action)}
        disabled={!currentFloorId}
        className={cn(
          "-md flex h-auto flex-col items-center px-2 py-1.5",
          isActive && !isEraseActive && "ring-2 ring-ring",
          isEraseActive && "text-destructive",
          isEraseAction && !isEraseActive && "hover:text-destructive",
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
    <div className="fixed top-4 left-1/2 z-10 -translate-x-1/2">
      <Popover
        open={open && selectedType !== null && activeDrawTool === "device"}
        onOpenChange={handleOpenChange}
      >
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
          <div className="flex items-center gap-1">
            {drawToolbarActions.map((action) => renderToolbarAction(action))}
          </div>

          {showWallColors ? (
            <div
              className={cn(
                "flex items-center gap-1",
                // eslint-disable-next-line
                wallColorSelectionEnabled ? "" : "hidden",
              )}
              aria-hidden={!wallColorSelectionEnabled}
            >
              <div className="h-6 w-px bg-border" aria-hidden />
              {WALL_COLOR_ORDER.map((color) => {
                const tone = WALL_COLOR_TONES[color];
                const isActive = selectedWallColor === color;

                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleSelectWallColor(color)}
                    disabled={!currentFloorId || !wallColorSelectionEnabled}
                    className={cn(
                      "h-6 w-6 rounded-full ring-ring transition-all",
                      isActive &&
                        "ring-offset-0.5 ring-2 ring-muted-foreground",
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

          <div className="flex items-center gap-1">
            {deviceToolbarActions.map((action) => renderToolbarAction(action))}
          </div>
        </div>

        <PopoverContent
          side="bottom"
          align="center"
          className="w-72 p-0"
          sideOffset={8}
          anchor={activeAnchorElement ?? undefined}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Rechercher un équipement..."
              className="h-9"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {filteredDevices.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Aucun équipement trouvé
                </div>
              ) : null}
              {filteredDevices.length > 0 ? (
                <CommandGroup>
                  {filteredDevices.map((device) => (
                    <CommandItem
                      key={device.id}
                      value={device.id}
                      onSelect={() => handleAddDevice(device)}
                      className="cursor-pointer"
                    >
                      <div className="flex w-full items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{device.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {device.model}
                            {device.hostname ? (
                              <span className="ml-2 font-mono">
                                {device.hostname}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          className="ml-2 h-4 w-4 shrink-0 opacity-0"
                          strokeWidth={2}
                        />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
