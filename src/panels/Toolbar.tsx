import { useCallback, useState, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ServerStack03Icon,
  HardDriveIcon,
  ComputerIcon,
  PlugSocketIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { useMapStore } from "@/store/useMapStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DeviceType, Device } from "@/types/map";
import { availableDevicesCatalog, type AvailableDevice } from "@/mock/availableDevices";

interface ToolbarButton {
  type: DeviceType;
  label: string;
  icon: React.ReactNode;
}

const toolbarButtons: ToolbarButton[] = [
  {
    type: "rack",
    label: "Rack",
    icon: <HugeiconsIcon icon={ServerStack03Icon} size={20} color="currentColor" strokeWidth={1.5} />,
  },
  {
    type: "switch",
    label: "Switch",
    icon: <HugeiconsIcon icon={HardDriveIcon} size={20} color="currentColor" strokeWidth={1.5} />,
  },
  {
    type: "pc",
    label: "PC",
    icon: <HugeiconsIcon icon={ComputerIcon} size={20} color="currentColor" strokeWidth={1.5} />,
  },
  {
    type: "wall-port",
    label: "Prise",
    icon: <HugeiconsIcon icon={PlugSocketIcon} size={20} color="currentColor" strokeWidth={1.5} />,
  },
];

export default function Toolbar() {
  const { currentFloorId, addDevice, isEditMode, checkCollision } = useMapStore();
  const reactFlow = useReactFlow();
  const [selectedType, setSelectedType] = useState<DeviceType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleTypeClick = useCallback((type: DeviceType) => {
    setSelectedType((prev) => (prev === type ? null : type));
    setSearchQuery("");
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
    },
    [currentFloorId, addDevice, reactFlow, checkCollision],
  );

  const availableDevices = selectedType ? availableDevicesCatalog[selectedType] : [];

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

  return (
    <div className="absolute top-4 right-4 z-10 flex gap-2">
      {/* Device selection dropdown - appears left of toolbar when active */}
      {selectedType && (
        <Card className="w-56 max-h-64 flex flex-col bg-card/95 backdrop-blur-sm">
          <CardHeader className="py-2 px-3">
            <CardTitle className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider">
              Choisir un équipement
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 px-2 pb-2 flex flex-col flex-1 min-h-0">
            {/* Search input */}
            <div className="relative mb-1.5">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <HugeiconsIcon icon={Search01Icon} size={12} color="currentColor" strokeWidth={1.5} />
              </span>
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher..."
                className="pl-6 pr-2 py-1 h-7 text-xs"
                autoFocus
              />
            </div>

            {/* Device list */}
            <ScrollArea className="flex-1">
              <div className="space-y-0.5">
                {filteredDevices.length > 0 ? (
                  filteredDevices.map((device) => (
                    <button
                      key={device.id}
                      onClick={() => handleAddDevice(device)}
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent transition-colors group"
                    >
                      <div className="font-medium text-foreground text-xs group-hover:text-primary">{device.name}</div>
                      {device.model && <div className="text-2xs text-muted-foreground">{device.model}</div>}
                      {device.hostname && (
                        <div className="text-2xs text-muted-foreground/70 font-mono">{device.hostname}</div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="text-center py-2 text-xs text-muted-foreground">Aucun résultat</div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Main toolbar - vertical compact */}
      <Card className="bg-card/90 backdrop-blur-sm p-1.5">
        <div className="flex flex-col gap-1">
          {toolbarButtons.map((btn) => (
            <Button
              key={btn.type}
              variant={selectedType === btn.type ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleTypeClick(btn.type)}
              disabled={!currentFloorId}
              className={cn(
                "flex flex-col items-center gap-0.5 h-auto px-2 py-1.5",
                selectedType === btn.type && "ring-2 ring-ring",
              )}
              title={`Ajouter ${btn.label}`}
            >
              <span className="[&>svg]:w-4 [&>svg]:h-4">{btn.icon}</span>
              <span className="text-2xs font-medium">{btn.label}</span>
            </Button>
          ))}
        </div>
      </Card>
    </div>
  );
}
