import { useCallback, useMemo, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerIcon,
  HardDriveIcon,
  PlugSocketIcon,
  ServerStack03Icon,
} from "@hugeicons/core-free-icons";
import { Check } from "lucide-react";
import type { Device, DeviceType } from "@/types/map";
import type { AvailableDevice } from "@/mock/availableDevices";
import { useMapStore } from "@/store/useMapStore";
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
import { cn } from "@/lib/utils";
import { availableDevicesCatalog } from "@/mock/availableDevices";

interface ToolbarButton {
  type: DeviceType;
  label: string;
  icon: React.ReactNode;
}

const toolbarButtons: Array<ToolbarButton> = [
  {
    type: "rack",
    label: "Rack",
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

export default function Toolbar() {
  const { currentFloorId, addDevice, isEditMode, checkCollision } =
    useMapStore();
  const reactFlow = useReactFlow();
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);

  const handleTypeClick = useCallback((type: DeviceType) => {
    setSelectedType((prev) => (prev === type ? null : type));
    setSearchQuery("");
    setOpen(true);
  }, []);

  const handleAddDevice = useCallback(
    (catalogDevice: AvailableDevice) => {
      if (!currentFloorId) return;

      // Get center of viewport
      const { x, y, zoom } = reactFlow.getViewport();
      const centerX = (-x + window.innerWidth / 2) / zoom;
      const centerY = (-y + window.innerHeight / 2) / zoom;

      // Snap to grid (20px)
      const snappedX = Math.round(centerX / 20) * 20;
      const snappedY = Math.round(centerY / 20) * 20;

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
            x: Math.round((snappedX + offset.x) / 20) * 20,
            y: Math.round((snappedY + offset.y) / 20) * 20,
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
      setSelectedType(null);
      setSearchQuery("");
      setOpen(false);
    },
    [currentFloorId, addDevice, reactFlow, checkCollision],
  );

  const availableDevices = selectedType
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

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      // Delay reset to avoid visual jump during close animation
      setTimeout(() => {
        setSelectedType(null);
        setSearchQuery("");
      }, 150);
    }
  };

  if (!isEditMode) {
    return null;
  }

  return (
    <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2">
      <Popover
        open={open && selectedType !== null}
        onOpenChange={handleOpenChange}
      >
        {/* Main toolbar - horizontal compact */}
        <div className="bg-card flex items-center rounded-lg p-1 shadow-lg">
          {toolbarButtons.map((btn) => (
            <PopoverTrigger
              key={btn.type}
              render={
                <Button
                  variant={selectedType === btn.type ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleTypeClick(btn.type)}
                  disabled={!currentFloorId}
                  className={cn(
                    "flex h-auto flex-col items-center gap-0.5 rounded-md px-3 py-1.5",
                    selectedType === btn.type && "ring-ring ring-2",
                  )}
                  title={`Ajouter ${btn.label}`}
                >
                  <span className="[&>svg]:h-5 [&>svg]:w-5">{btn.icon}</span>
                  <span className="text-xs font-medium">{btn.label}</span>
                </Button>
              }
            />
          ))}
        </div>

        {/* Device selection popover */}
        <PopoverContent
          side="bottom"
          align="center"
          className="w-72 p-0"
          sideOffset={8}
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
                <div className="text-muted-foreground py-6 text-center text-sm">
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
                          <p className="text-muted-foreground text-xs">
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
