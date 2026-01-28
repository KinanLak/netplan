import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserIcon, WasteIcon } from "@hugeicons/core-free-icons";
import { useMapStore } from "@/store/useMapStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DeviceStatus } from "@/types/map";

const statusLabels: Record<DeviceStatus, string> = {
  up: "En ligne",
  down: "Hors ligne",
  unknown: "Inconnu",
};

const statusVariants: Record<DeviceStatus, "default" | "destructive" | "secondary"> = {
  up: "default",
  down: "destructive",
  unknown: "secondary",
};

const typeLabels: Record<string, string> = {
  rack: "Rack Serveur",
  switch: "Switch Réseau",
  pc: "Poste de travail",
  "wall-port": "Prise murale",
};

export default function DeviceDrawer() {
  const {
    devices,
    selectedDeviceId,
    selectDevice,
    deleteDevice,
    isEditMode,
    highlightedDeviceIds,
    setHighlightedDevices,
  } = useMapStore();

  const reactFlow = useReactFlow();

  const device = devices.find((d) => d.id === selectedDeviceId);

  // Get connected devices
  const connectedDevices =
    device?.metadata.connectedDeviceIds?.map((id) => devices.find((d) => d.id === id)).filter(Boolean) ?? [];

  const handleHighlightConnections = useCallback(() => {
    if (!device?.metadata.connectedDeviceIds) return;

    // Toggle highlight
    if (highlightedDeviceIds.length > 0) {
      setHighlightedDevices([]);
    } else {
      setHighlightedDevices(device.metadata.connectedDeviceIds);
    }
  }, [device, highlightedDeviceIds, setHighlightedDevices]);

  const handleSelectConnected = useCallback(
    (deviceId: string) => {
      const targetDevice = devices.find((d) => d.id === deviceId);
      if (targetDevice) {
        // Smooth camera movement to the target device
        const centerX = targetDevice.position.x + targetDevice.size.width / 2;
        const centerY = targetDevice.position.y + targetDevice.size.height / 2;
        const currentZoom = reactFlow.getZoom();

        reactFlow.setCenter(centerX, centerY, {
          duration: 500,
          zoom: currentZoom,
        });
      }
      setHighlightedDevices([]);
      selectDevice(deviceId);
    },
    [devices, selectDevice, setHighlightedDevices, reactFlow],
  );

  if (!device) {
    return null;
  }

  const status = device.metadata.status ?? "unknown";

  return (
    <Card className="absolute top-0 right-0 w-80 h-full rounded-none border-l border-t-0 border-b-0 border-r-0 shadow-xl z-20 flex flex-col">
      {/* Header */}
      <CardHeader className="pb-3 bg-linear-to-r from-muted/50 to-background">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{device.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{typeLabels[device.type]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setHighlightedDevices([]);
              selectDevice(null);
            }}
            className="h-8 w-8"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} color="currentColor" strokeWidth={1.5} />
          </Button>
        </div>

        {/* Status badge */}
        <div className="mt-3">
          <Badge variant={statusVariants[status]} className="gap-1.5">
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                status === "up" && "bg-primary-foreground",
                status === "down" && "bg-destructive-foreground",
                status === "unknown" && "bg-secondary-foreground",
              )}
            />
            {statusLabels[status]}
          </Badge>
        </div>
      </CardHeader>

      {/* Content */}
      <ScrollArea className="flex-1">
        <CardContent className="space-y-4">
          {/* Hostname & IP */}
          {(device.hostname || device.metadata.ip) && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Réseau</h3>
              <div className="space-y-2">
                {device.hostname && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="font-mono text-foreground">{device.hostname}</span>
                  </div>
                )}
                {device.metadata.ip && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IP</span>
                    <span className="font-mono text-foreground">{device.metadata.ip}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Last user (for PCs) */}
          {device.type === "pc" && device.metadata.lastUser && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Utilisateur</h3>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                  <HugeiconsIcon icon={UserIcon} size={16} color="currentColor" strokeWidth={1.5} />
                </div>
                <div>
                  <div className="font-medium text-foreground">{device.metadata.lastUser}</div>
                  <div className="text-xs text-muted-foreground">Dernier connecté</div>
                </div>
              </div>
            </section>
          )}

          {/* Model */}
          {device.metadata.model && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Matériel</h3>
              <div className="text-sm">
                <span className="text-foreground">{device.metadata.model}</span>
              </div>
            </section>
          )}

          {/* Connected devices */}
          {connectedDevices.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Connexions ({connectedDevices.length})
                </h3>
                <Button
                  variant={highlightedDeviceIds.length > 0 ? "secondary" : "outline"}
                  size="sm"
                  onClick={handleHighlightConnections}
                  className="h-6 text-xs"
                >
                  {highlightedDeviceIds.length > 0 ? "Masquer" : "Voir sur plan"}
                </Button>
              </div>
              <div className="space-y-1">
                {connectedDevices.map(
                  (connDevice) =>
                    connDevice && (
                      <button
                        key={connDevice.id}
                        onClick={() => handleSelectConnected(connDevice.id)}
                        className="w-full text-left px-3 py-2 rounded-lg bg-muted hover:bg-accent transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-foreground group-hover:text-primary">
                              {connDevice.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{typeLabels[connDevice.type]}</div>
                          </div>
                          <div
                            className={cn(
                              "w-2 h-2 rounded-full",
                              connDevice.metadata.status === "up" && "bg-chart-2",
                              connDevice.metadata.status === "down" && "bg-destructive",
                              connDevice.metadata.status === "unknown" && "bg-muted-foreground",
                            )}
                          />
                        </div>
                      </button>
                    ),
                )}
              </div>
            </section>
          )}

          {/* Ports (for switches) */}
          {device.type === "switch" && device.metadata.ports && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Ports ({device.metadata.ports.length})
              </h3>
              <div className="grid grid-cols-12 gap-1">
                {device.metadata.ports.map((port) => (
                  <div
                    key={port.id}
                    className={cn(
                      "w-4 h-4 rounded-sm text-[8px] flex items-center justify-center",
                      port.status === "up" && "bg-chart-2 text-primary-foreground",
                      port.status === "down" && "bg-destructive text-destructive-foreground",
                      port.status !== "up" && port.status !== "down" && "bg-muted text-muted-foreground",
                    )}
                    title={`Port ${port.number}: ${port.status}`}
                  >
                    {port.number}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-chart-2 rounded-sm" />
                  {device.metadata.ports.filter((p) => p.status === "up").length} actifs
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-destructive rounded-sm" />
                  {device.metadata.ports.filter((p) => p.status === "down").length} down
                </span>
              </div>
            </section>
          )}

          {/* Position */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Position</h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">X:</span>{" "}
                <span className="font-mono text-foreground">{device.position.x}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Y:</span>{" "}
                <span className="font-mono text-foreground">{device.position.y}</span>
              </div>
            </div>
          </section>
        </CardContent>
      </ScrollArea>

      {/* Footer actions */}
      {isEditMode && (
        <div className="p-4 border-t border-border bg-muted/50 space-y-2">
          <Button
            variant="destructive"
            onClick={() => {
              deleteDevice(device.id);
              selectDevice(null);
            }}
            className="w-full gap-2"
          >
            <HugeiconsIcon icon={WasteIcon} size={16} color="currentColor" strokeWidth={1.5} />
            Supprimer
          </Button>
        </div>
      )}
    </Card>
  );
}
