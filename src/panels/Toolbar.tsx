import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import type { Device, DeviceType, DrawTool } from "@/types/map";
import type { AvailableDevice } from "@/mock/availableDevices";
import type { ToolbarAction } from "@/panels/toolbar-actions";
import { useMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
} from "@/store/selectors";
import { useShortcut } from "@/hooks/use-shortcuts";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ShortcutHintAbsolute } from "@/components/ui/shortcut-hint";
import { cn } from "@/lib/utils";
import { availableDevicesCatalog } from "@/mock/availableDevices";
import {
  TOOLBAR_DEVICE_BUTTONS_INITIAL_STATE,
  TOOLBAR_DEVICE_COLLISION_OFFSETS,
  UNDO_REDO_EVENT_NAME,
  UNDO_REDO_FLASH_DURATION_MS,
} from "@/lib/constants";
import { GRID_SIZE } from "@/lib/walls";
import {
  deviceToolbarActions,
  drawToolbarActions,
} from "@/panels/toolbar-actions";

export default function Toolbar() {
  const currentFloorId = useCurrentFloorId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();

  const addDevice = useMapStore((state) => state.addDevice);
  const checkCollision = useMapStore((state) => state.checkCollision);
  const setActiveDrawTool = useMapUiStore((state) => state.setActiveDrawTool);
  const selectDevice = useMapUiStore((state) => state.selectDevice);
  const reactFlow = useReactFlow();
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeAnchorElement, setActiveAnchorElement] =
    useState<HTMLButtonElement | null>(null);
  const [flashType, setFlashType] = useState<"undo" | "redo" | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: Event) => {
      const type = (event as CustomEvent<{ type: "undo" | "redo" }>).detail
        .type;
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

  const buttonElementsRef = useRef<
    Record<DeviceType, HTMLButtonElement | null>
  >({
    ...TOOLBAR_DEVICE_BUTTONS_INITIAL_STATE,
  });

  const handleTypeClick = (type: DeviceType) => {
    const nextType = selectedType === type ? null : type;
    const nextAnchorElement = nextType
      ? buttonElementsRef.current[nextType]
      : null;

    setActiveDrawTool("device");
    selectDevice(null);
    setSelectedType(nextType);
    setActiveAnchorElement(nextAnchorElement);
    setOpen(nextType !== null);
    setSearchQuery("");
    setPlacementError(null);
  };

  const handleDrawToolClick = (
    tool: Extract<DrawTool, "wall" | "wall-brush" | "wall-erase" | "room">,
  ) => {
    if (!currentFloorId) return;

    const nextTool = activeDrawTool === tool ? "device" : tool;
    setActiveDrawTool(nextTool);
    selectDevice(null);
    setSelectedType(null);
    setActiveAnchorElement(null);
    setOpen(false);
    setSearchQuery("");
    setPlacementError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSelectedType(null);
      setActiveAnchorElement(null);
      setSearchQuery("");
      setPlacementError(null);
    }
  };

  useShortcut("tool-wall", () => handleDrawToolClick("wall"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-wall-erase", () => handleDrawToolClick("wall-erase"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-wall-brush", () => handleDrawToolClick("wall-brush"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-room", () => handleDrawToolClick("room"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-rack", () => handleTypeClick("rack"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-switch", () => handleTypeClick("switch"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-pc", () => handleTypeClick("pc"), {
    enabled: isEditMode && !!currentFloorId,
  });
  useShortcut("tool-wall-port", () => handleTypeClick("wall-port"), {
    enabled: isEditMode && !!currentFloorId,
  });

  const handleAddDevice = (catalogDevice: AvailableDevice) => {
    if (!currentFloorId) return;

    const { x, y, zoom } = reactFlow.getViewport();
    const centerX = (-x + window.innerWidth / 2) / zoom;
    const centerY = (-y + window.innerHeight / 2) / zoom;

    const snappedX = Math.round(centerX / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(centerY / GRID_SIZE) * GRID_SIZE;
    const position = { x: snappedX, y: snappedY };
    const candidatePositions = [position];

    const hasCollision = checkCollision({
      floorId: currentFloorId,
      deviceId: "",
      position,
      size: catalogDevice.size,
    });

    if (hasCollision) {
      for (const offset of TOOLBAR_DEVICE_COLLISION_OFFSETS) {
        candidatePositions.push({
          x: Math.round((snappedX + offset.x) / GRID_SIZE) * GRID_SIZE,
          y: Math.round((snappedY + offset.y) / GRID_SIZE) * GRID_SIZE,
        });
      }
    }

    const newDevice: Omit<Device, "id"> = {
      type: catalogDevice.type,
      name: catalogDevice.name,
      hostname: catalogDevice.hostname,
      floorId: currentFloorId,
      position,
      size: catalogDevice.size,
      metadata: {
        ...catalogDevice.metadata,
        ip: catalogDevice.ip,
      },
    };

    const result = addDevice({
      device: newDevice,
      candidatePositions,
    });
    if (!result.ok) {
      setPlacementError(
        "Impossible d'ajouter l'équipement ici: toutes les positions candidates collisionnent.",
      );
      return;
    }

    setPlacementError(null);
    setActiveDrawTool("device");
    setSelectedType(null);
    setActiveAnchorElement(null);
    setSearchQuery("");
    setOpen(false);
  };

  const availableDevices =
    activeDrawTool === "device" && selectedType
      ? availableDevicesCatalog[selectedType]
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
            ? (element: HTMLButtonElement | null) => {
                buttonElementsRef.current[action.type] = element;
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
        {action.group === "device" ? (
          <PopoverTrigger render={button} />
        ) : (
          button
        )}
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
            {placementError ? (
              <div className="border-t px-3 py-2 text-xs text-destructive">
                {placementError}
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
