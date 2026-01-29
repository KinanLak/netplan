import { useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserIcon, WasteIcon } from "@hugeicons/core-free-icons";
import type { DeviceStatus } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const statusLabels: Record<DeviceStatus, string> = {
  up: "En ligne",
  down: "Hors ligne",
  unknown: "Inconnu",
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
    device?.metadata.connectedDeviceIds
      ?.map((id) => devices.find((d) => d.id === id))
      .filter(Boolean) ?? [];

  // Check if the currently highlighted devices belong to this device
  const isCurrentDeviceHighlighted = useMemo(() => {
    if (
      !device?.metadata.connectedDeviceIds ||
      highlightedDeviceIds.length === 0
    )
      return false;
    // Check if highlighted devices are exactly this device's connections
    const connectedSet = new Set(device.metadata.connectedDeviceIds);
    return highlightedDeviceIds.every((id) => connectedSet.has(id));
  }, [device?.metadata.connectedDeviceIds, highlightedDeviceIds]);

  const handleHighlightConnections = useCallback(() => {
    if (!device?.metadata.connectedDeviceIds) return;

    // If this device's connections are highlighted, hide them. Otherwise, show this device's connections.
    if (isCurrentDeviceHighlighted) {
      setHighlightedDevices([]);
    } else {
      setHighlightedDevices(device.metadata.connectedDeviceIds);
    }
  }, [device, isCurrentDeviceHighlighted, setHighlightedDevices]);

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
    <aside className="bg-card border-border absolute top-0 right-0 z-20 flex h-full w-80 flex-col border-l shadow-xl">
      {/* Header */}
      <header className="from-muted to-card space-y-3 bg-linear-to-t px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-foreground truncate text-lg font-semibold">
              {device.name}
            </h2>
            <p className="text-muted-foreground text-sm">
              {typeLabels[device.type]}
            </p>
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
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={20}
              color="currentColor"
              strokeWidth={1.5}
            />
          </Button>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border py-1.5 pr-3 pl-2 text-sm font-medium",
            status === "up" && "border-up bg-up-background text-up",
            status === "down" && "border-down bg-down-background text-down",
            status === "unknown" &&
              "border-unknown bg-unknown-background text-unknown",
          )}
        >
          <span
            className={cn(
              "size-4 rounded-full",
              status === "up" && "bg-up",
              status === "down" && "bg-down",
              status === "unknown" && "bg-unknown",
            )}
          />
          {statusLabels[status]}
        </span>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-4">
          {/* Hostname & IP */}
          {(device.hostname || device.metadata.ip) && (
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Réseau
              </h3>
              <div className="space-y-2">
                {device.hostname && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="text-foreground font-mono">
                      {device.hostname}
                    </span>
                  </div>
                )}
                {device.metadata.ip && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IP</span>
                    <span className="text-foreground font-mono">
                      {device.metadata.ip}
                    </span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Last user (for PCs) */}
          {device.type === "pc" && device.metadata.lastUser && (
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Utilisateur
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <div className="bg-secondary text-primary flex h-8 w-8 items-center justify-center rounded-full">
                  <HugeiconsIcon
                    icon={UserIcon}
                    size={16}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <div className="text-foreground font-medium">
                    {device.metadata.lastUser}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    Dernier connecté
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Model */}
          {device.metadata.model && (
            <section>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Matériel
              </h3>
              <div className="text-sm">
                <span className="text-foreground">{device.metadata.model}</span>
              </div>
            </section>
          )}

          {/* Connected devices */}
          {connectedDevices.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                  Connexions ({connectedDevices.length})
                </h3>
                <Button
                  variant={isCurrentDeviceHighlighted ? "secondary" : "outline"}
                  size="sm"
                  onClick={handleHighlightConnections}
                  className="h-6 text-xs"
                >
                  {isCurrentDeviceHighlighted ? "Masquer" : "Voir sur plan"}
                </Button>
              </div>
              <div className="space-y-1">
                {connectedDevices.map(
                  (connDevice) =>
                    connDevice && (
                      <button
                        key={connDevice.id}
                        onClick={() => handleSelectConnected(connDevice.id)}
                        className="bg-muted hover:bg-accent group w-full rounded-lg px-3 py-2 text-left transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-foreground group-hover:text-primary text-sm font-medium">
                              {connDevice.name}
                            </div>
                            <div className="text-muted-foreground text-xs">
                              {typeLabels[connDevice.type]}
                            </div>
                          </div>
                          <div
                            className={cn(
                              "h-2 w-2 rounded-full",
                              connDevice.metadata.status === "up" && "bg-up",
                              connDevice.metadata.status === "down" &&
                                "bg-down",
                              connDevice.metadata.status === "unknown" &&
                                "bg-unknown",
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
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
                Ports ({device.metadata.ports.length})
              </h3>
              <div className="grid grid-cols-12 gap-1">
                {device.metadata.ports.map((port) => (
                  <div
                    key={port.id}
                    className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-sm text-[8px]",
                      port.status === "up" && "bg-up text-primary-foreground",
                      port.status === "down" &&
                        "bg-down text-primary-foreground",
                      port.status === "unknown" &&
                        "bg-unknown text-primary-foreground",
                    )}
                    title={`Port ${port.number}: ${port.status}`}
                  >
                    {port.number}
                  </div>
                ))}
              </div>
              <div className="text-muted-foreground mt-2 flex gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="bg-up h-2 w-2 rounded-sm" />
                  {
                    device.metadata.ports.filter((p) => p.status === "up")
                      .length
                  }{" "}
                  actifs
                </span>
                <span className="flex items-center gap-1">
                  <span className="bg-down h-2 w-2 rounded-sm" />
                  {
                    device.metadata.ports.filter((p) => p.status === "down")
                      .length
                  }{" "}
                  down
                </span>
              </div>
            </section>
          )}

          {/* Position */}
          <section>
            <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
              Position
            </h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">X:</span>{" "}
                <span className="text-foreground font-mono">
                  {device.position.x}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Y:</span>{" "}
                <span className="text-foreground font-mono">
                  {device.position.y}
                </span>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>

      {/* Footer actions */}
      {isEditMode && (
        <footer className="border-border bg-muted space-y-2 border-t p-4">
          <Button
            variant="destructive"
            onClick={() => {
              deleteDevice(device.id);
              selectDevice(null);
            }}
            className="w-full gap-2"
          >
            <HugeiconsIcon
              icon={WasteIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
            Supprimer
          </Button>
        </footer>
      )}
    </aside>
  );
}
