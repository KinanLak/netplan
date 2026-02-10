import { useCallback, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  HardDriveIcon,
  PlugSocketIcon,
  ServerStack03Icon,
} from "@hugeicons/core-free-icons";
import { Check, Minus, Square } from "lucide-react";
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

interface ToolbarButton {
  type: DeviceType;
  label: string;
  icon: React.ReactNode;
  shortcut: ShortcutAction;
}

interface DrawToolButton {
  tool: Extract<DrawTool, "wall" | "room">;
  label: string;
  icon: React.ReactNode;
  shortcut: ShortcutAction;
}

const toolbarButtons: Array<ToolbarButton> = [
  {
    type: "rack",
    label: "Rack",
    shortcut: "tool-rack",
    icon: (
      <HugeiconsIcon
        icon={ServerStack03Icon}
        size={20}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    type: "switch",
    label: "Switch",
    shortcut: "tool-switch",
    icon: (
      <HugeiconsIcon
        icon={HardDriveIcon}
        size={20}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    type: "pc",
    label: "PC",
    shortcut: "tool-pc",
    icon: (
      <HugeiconsIcon
        icon={ComputerIcon}
        size={20}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
  {
    type: "wall-port",
    label: "Prise",
    shortcut: "tool-wall-port",
    icon: (
      <HugeiconsIcon
        icon={PlugSocketIcon}
        size={20}
        color="currentColor"
        strokeWidth={1.5}
      />
    ),
  },
];

const drawToolButtons: Array<DrawToolButton> = [
  {
    tool: "wall",
    label: "Mur",
    shortcut: "tool-wall",
    icon: <Minus className="h-5 w-5" />,
  },
  {
    tool: "room",
    label: "Salle",
    shortcut: "tool-room",
    icon: <Square className="h-4 w-4" />,
  },
];

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

  // Refs for each device type button to use as popover anchors
  const buttonRefs = useRef<Record<DeviceType, HTMLButtonElement | null>>({
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

  const availableDevices =
    activeDrawTool === "device" && selectedType
      ? availableDevicesCatalog[selectedType]
      : [];

  // Filter devices based on search query
  const filteredDevices = useMemo(() => {
    if (!searchQuery.trim()) return availableDevices;
    const query = searchQuery.toLowerCase();
    return availableDevices.filter(
      (device) =>
        device.name.toLowerCase().includes(query) ||
        device.model?.toLowerCase().includes(query) ||
        device.hostname?.toLowerCase().includes(query),
    );
  }, [availableDevices, searchQuery]);

  if (!isEditMode) {
    return null;
  }

  const showWallColors = activeDrawTool === "wall" || activeDrawTool === "room";
  const wallColorSelectionEnabled = false;

  return (
    <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2">
      <Popover
        open={open && selectedType !== null && activeDrawTool === "device"}
        onOpenChange={handleOpenChange}
      >
        <div className="flex items-center gap-2 rounded-lg bg-card p-1 shadow-lg">
          <div className="flex items-center gap-1 border-r pr-2">
            {drawToolButtons.map((btn) => (
              <div key={btn.tool} className="relative">
                <Button
                  variant={activeDrawTool === btn.tool ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleDrawToolClick(btn.tool)}
                  disabled={!currentFloorId}
                  className={cn(
                    "flex h-auto min-w-16 flex-col items-center gap-0.5 rounded-md px-2 py-1.5",
                    activeDrawTool === btn.tool && "ring-2 ring-ring",
                  )}
                  title={`Tracer ${btn.label.toLowerCase()}`}
                >
                  <span className="[&>svg]:h-5 [&>svg]:w-5">{btn.icon}</span>
                  <span className="text-xs font-medium">{btn.label}</span>
                </Button>
                <ShortcutHintAbsolute
                  action={btn.shortcut}
                  position="bottom-center"
                />
              </div>
            ))}
          </div>

          {showWallColors && (
            <div
              className={cn(
                "border-r pr-2",
                wallColorSelectionEnabled
                  ? "flex items-center gap-1"
                  : "hidden",
              )}
              aria-hidden={!wallColorSelectionEnabled}
            >
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
                      "h-6 w-6 rounded-full border-2 ring-ring transition-all",
                      isActive && "ring-2 ring-offset-1",
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

          <div className="flex items-center gap-1">
            {toolbarButtons.map((btn) => (
              <div key={btn.type} className="relative">
                <PopoverTrigger
                  render={
                    <Button
                      ref={(el) => {
                        buttonRefs.current[btn.type] = el;
                      }}
                      variant={
                        selectedType === btn.type ? "secondary" : "ghost"
                      }
                      size="sm"
                      onClick={() => handleTypeClick(btn.type)}
                      disabled={!currentFloorId}
                      className={cn(
                        "flex h-auto flex-col items-center gap-0.5 rounded-md px-3 py-1.5",
                        selectedType === btn.type &&
                          activeDrawTool === "device" &&
                          "ring-2 ring-ring",
                      )}
                      title={`Ajouter ${btn.label}`}
                    >
                      <span className="[&>svg]:h-5 [&>svg]:w-5">
                        {btn.icon}
                      </span>
                      <span className="text-xs font-medium">{btn.label}</span>
                    </Button>
                  }
                />
                <ShortcutHintAbsolute
                  action={btn.shortcut}
                  position="bottom-center"
                />
              </div>
            ))}
          </div>
        </div>

        <PopoverContent
          side="bottom"
          align="center"
          className="w-72 p-0"
          sideOffset={8}
          anchor={selectedType ? buttonRefs.current[selectedType] : undefined}
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
