import { useCallback, useEffect, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  DashedLine01Icon,
  DashedLine02Icon,
  HardDriveIcon,
  PlugSocketIcon,
  ServerStack03Icon,
} from "@hugeicons/core-free-icons";
import { Check } from "lucide-react";
import type { Device, DeviceType, DrawTool } from "@/types/map";
import type { AvailableDevice } from "@/mock/availableDevices";
import type { ShortcutAction } from "@/lib/shortcuts";
import { useMapStore } from "@/store/useMapStore";
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
import { GRID_SIZE, WALL_COLOR_ORDER, WALL_COLOR_TONES } from "@/lib/walls";

interface ToolbarActionBase {
  group: "draw" | "device";
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut: ShortcutAction;
  title: string;
}

interface DeviceToolbarAction extends ToolbarActionBase {
  group: "device";
  type: DeviceType;
}

interface DrawToolbarAction extends ToolbarActionBase {
  group: "draw";
  tool: Extract<DrawTool, "wall" | "room">;
}

type ToolbarAction = DeviceToolbarAction | DrawToolbarAction;

const TOOLBAR_ICON_SIZE_CLASS = "size-6";

const toolbarActions: Array<ToolbarAction> = [
  {
    group: "draw",
    id: "wall",
    tool: "wall",
    label: "Mur",
    shortcut: "tool-wall",
    title: "Tracer mur",
    icon: (
      <HugeiconsIcon
        icon={DashedLine01Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    group: "draw",
    id: "room",
    tool: "room",
    label: "Salle",
    shortcut: "tool-room",
    title: "Tracer salle",
    icon: (
      <HugeiconsIcon
        icon={DashedLine02Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    group: "device",
    id: "rack",
    type: "rack",
    label: "Rack",
    shortcut: "tool-rack",
    title: "Ajouter Rack",
    icon: (
      <HugeiconsIcon
        icon={ServerStack03Icon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    group: "device",
    id: "switch",
    type: "switch",
    label: "Switch",
    shortcut: "tool-switch",
    title: "Ajouter Switch",
    icon: (
      <HugeiconsIcon
        icon={HardDriveIcon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    group: "device",
    id: "pc",
    type: "pc",
    label: "PC",
    shortcut: "tool-pc",
    title: "Ajouter PC",
    icon: (
      <HugeiconsIcon
        icon={ComputerIcon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    group: "device",
    id: "wall-port",
    type: "wall-port",
    label: "Prise",
    shortcut: "tool-wall-port",
    title: "Ajouter Prise",
    icon: (
      <HugeiconsIcon
        icon={PlugSocketIcon}
        className={TOOLBAR_ICON_SIZE_CLASS}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
];

const drawToolbarActions = toolbarActions.filter(
  (action): action is DrawToolbarAction => action.group === "draw",
);
const deviceToolbarActions = toolbarActions.filter(
  (action): action is DeviceToolbarAction => action.group === "device",
);

export default function Toolbar() {
  const {
    currentFloorId,
    addDevice,
    isEditMode,
    checkCollision,
    activeDrawTool,
    setActiveDrawTool,
    selectedWallColor,
    setSelectedWallColor,
    selectDevice,
  } = useMapStore();
  const reactFlow = useReactFlow();
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [flashType, setFlashType] = useState<"undo" | "redo" | null>(null);

  // Listen for undo/redo events and flash the toolbar background
  useEffect(() => {
    const handler = (e: Event) => {
      const type = (e as CustomEvent<{ type: "undo" | "redo" }>).detail.type;
      setFlashType(type);
      const timeout = setTimeout(() => setFlashType(null), 500);
      return () => clearTimeout(timeout);
    };
    window.addEventListener("netplan:undo-redo", handler);
    return () => window.removeEventListener("netplan:undo-redo", handler);
  }, []);

  // Track button elements as state so they can be read during render (refs cannot)
  const [buttonElements, setButtonElements] = useState<
    Record<DeviceType, HTMLButtonElement | null>
  >({
    rack: null,
    switch: null,
    pc: null,
    "wall-port": null,
  });

  const handleTypeClick = useCallback(
    (type: DeviceType) => {
      const nextType = selectedType === type ? null : type;
      setActiveDrawTool("device");
      selectDevice(null);
      setSelectedType(nextType);
      setOpen(nextType !== null);
      setSearchQuery("");
    },
    [selectedType, selectDevice, setActiveDrawTool],
  );

  const handleDrawToolClick = useCallback(
    (tool: Extract<DrawTool, "wall" | "room">) => {
      if (!currentFloorId) return;

      const nextTool = activeDrawTool === tool ? "device" : tool;
      setActiveDrawTool(nextTool);
      selectDevice(null);
      setSelectedType(null);
      setOpen(false);
      setSearchQuery("");
    },
    [activeDrawTool, currentFloorId, selectDevice, setActiveDrawTool],
  );

  const handleSelectWallColor = useCallback(
    (color: typeof selectedWallColor) => {
      setSelectedWallColor(color);
    },
    [setSelectedWallColor],
  );

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSelectedType(null);
      setSearchQuery("");
    }
  }, []);

  // Register keyboard shortcut handlers
  useShortcut(
    "tool-wall",
    useCallback(() => handleDrawToolClick("wall"), [handleDrawToolClick]),
    { enabled: isEditMode && !!currentFloorId },
  );
  useShortcut(
    "tool-room",
    useCallback(() => handleDrawToolClick("room"), [handleDrawToolClick]),
    { enabled: isEditMode && !!currentFloorId },
  );
  useShortcut(
    "tool-rack",
    useCallback(() => handleTypeClick("rack"), [handleTypeClick]),
    { enabled: isEditMode && !!currentFloorId },
  );
  useShortcut(
    "tool-switch",
    useCallback(() => handleTypeClick("switch"), [handleTypeClick]),
    { enabled: isEditMode && !!currentFloorId },
  );
  useShortcut(
    "tool-pc",
    useCallback(() => handleTypeClick("pc"), [handleTypeClick]),
    { enabled: isEditMode && !!currentFloorId },
  );
  useShortcut(
    "tool-wall-port",
    useCallback(() => handleTypeClick("wall-port"), [handleTypeClick]),
    { enabled: isEditMode && !!currentFloorId },
  );

  const handleAddDevice = useCallback(
    (catalogDevice: AvailableDevice) => {
      if (!currentFloorId) return;

      // Get center of viewport
      const { x, y, zoom } = reactFlow.getViewport();
      const centerX = (-x + window.innerWidth / 2) / zoom;
      const centerY = (-y + window.innerHeight / 2) / zoom;

      // Snap to grid
      const snappedX = Math.round(centerX / GRID_SIZE) * GRID_SIZE;
      const snappedY = Math.round(centerY / GRID_SIZE) * GRID_SIZE;

      const position = { x: snappedX, y: snappedY };

      // Check collision at this position
      const hasCollision = checkCollision("", position, catalogDevice.size);

      // If collision, try to find a free spot nearby
      let finalPosition = position;
      if (hasCollision) {
        // Try positions in a spiral pattern
        const offsets = [
          { x: 100, y: 0 },
          { x: 0, y: 100 },
          { x: -100, y: 0 },
          { x: 0, y: -100 },
          { x: 100, y: 100 },
          { x: -100, y: 100 },
          { x: -100, y: -100 },
          { x: 100, y: -100 },
          { x: 200, y: 0 },
          { x: 0, y: 200 },
        ];

        for (const offset of offsets) {
          const newPos = {
            x: Math.round((snappedX + offset.x) / GRID_SIZE) * GRID_SIZE,
            y: Math.round((snappedY + offset.y) / GRID_SIZE) * GRID_SIZE,
          };
          if (!checkCollision("", newPos, catalogDevice.size)) {
            finalPosition = newPos;
            break;
          }
        }
      }

      const newDevice: Omit<Device, "id"> = {
        type: catalogDevice.type,
        name: catalogDevice.name,
        hostname: catalogDevice.hostname,
        floorId: currentFloorId,
        position: finalPosition,
        size: catalogDevice.size,
        metadata: {
          ...catalogDevice.metadata,
          ip: catalogDevice.ip,
        },
      };

      addDevice(newDevice);
      setActiveDrawTool("device");
      setSelectedType(null);
      setSearchQuery("");
      setOpen(false);
    },
    [currentFloorId, addDevice, reactFlow, checkCollision, setActiveDrawTool],
  );

  // Filter devices based on search query
  const filteredDevices = useMemo(() => {
    const availableDevices =
      activeDrawTool === "device" && selectedType
        ? availableDevicesCatalog[selectedType]
        : [];
    if (!searchQuery.trim()) return availableDevices;
    const query = searchQuery.toLowerCase();
    return availableDevices.filter(
      (device) =>
        device.name.toLowerCase().includes(query) ||
        device.model?.toLowerCase().includes(query) ||
        device.hostname?.toLowerCase().includes(query),
    );
  }, [activeDrawTool, selectedType, searchQuery]);

  if (!isEditMode) {
    return null;
  }

  const showWallColors = activeDrawTool === "wall" || activeDrawTool === "room";
  const wallColorSelectionEnabled = true;
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
    const button = (
      <Button
        ref={
          action.group === "device"
            ? (el: HTMLButtonElement | null) => {
                setButtonElements((prev) =>
                  prev[action.type] === el
                    ? prev
                    : { ...prev, [action.type]: el },
                );
              }
            : undefined
        }
        variant={isActive ? "secondary" : "ghost"}
        size="sm"
        onClick={() => handleToolbarActionClick(action)}
        disabled={!currentFloorId}
        className={cn(
          "-md flex h-auto flex-col items-center px-2 py-1.5",
          isActive && "ring-2 ring-ring",
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

          {showWallColors && (
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
          )}

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
          anchor={selectedType ? buttonElements[selectedType] : undefined}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Rechercher un équipement..."
              className="h-9"
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList>
              {filteredDevices.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Aucun équipement trouvé
                </div>
              )}
              {filteredDevices.length > 0 && (
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
                            {device.hostname && (
                              <span className="ml-2 font-mono">
                                {device.hostname}
                              </span>
                            )}
                          </p>
                        </div>
                        <Check className="ml-2 h-4 w-4 shrink-0 opacity-0" />
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
