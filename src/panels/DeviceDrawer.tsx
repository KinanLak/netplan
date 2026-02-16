import { useCallback, useMemo } from "react";
import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserIcon, WasteIcon } from "@hugeicons/core-free-icons";
import type { DeviceStatus } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import { useDrawerScope, useShortcut } from "@/hooks/use-shortcuts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
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
    // Check if highlighted devices include this device and its connections
    const allIds = [device.id, ...device.metadata.connectedDeviceIds];
    return allIds.every((id) => highlightedDeviceIds.includes(id));
  }, [device?.id, device?.metadata.connectedDeviceIds, highlightedDeviceIds]);

  const handleHighlightConnections = useCallback(() => {
    if (!device?.metadata.connectedDeviceIds) return;

    // If this device's connections are highlighted, hide them. Otherwise, show this device's connections.
    if (isCurrentDeviceHighlighted) {
      setHighlightedDevices([]);
    } else {
      // Include the device itself and its connections
      setHighlightedDevices([device.id, ...device.metadata.connectedDeviceIds]);
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

  const handleCloseDrawer = useCallback(() => {
    setHighlightedDevices([]);
    selectDevice(null);
  }, [setHighlightedDevices, selectDevice]);

  const handleDeleteDevice = useCallback(() => {
    if (!device) return;
    deleteDevice(device.id);
    selectDevice(null);
  }, [device, deleteDevice, selectDevice]);

  // Manage drawer scope - enables drawer shortcuts when open
  useDrawerScope(!!device);

  // Register keyboard shortcuts
  useShortcut("close-drawer", handleCloseDrawer);
  useShortcut("delete-device", handleDeleteDevice, { enabled: isEditMode });
  useShortcut("highlight-connections", handleHighlightConnections, {
    enabled: (device?.metadata.connectedDeviceIds?.length ?? 0) > 0,
  });

  if (!device) {
    return null;
  }

  const status = device.metadata.status ?? "unknown";

  return (
    <aside className="absolute top-0 right-0 z-20 flex h-full w-80 flex-col border-l border-border bg-card shadow-xl">
      {/* Header */}
      <header className="space-y-3 bg-linear-to-t from-muted to-card px-4 py-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-foreground">
              {device.name}
            </h2>
            <p className="text-sm text-muted-foreground">
              {typeLabels[device.type]}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCloseDrawer}
            className="flex h-8 items-center gap-1.5 px-2"
          >
            <Kbd>esc</Kbd>
            <HugeiconsIcon
              icon={Cancel01Icon}
              size={18}
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
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Réseau
              </h3>
              <div className="space-y-2">
                {device.hostname && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="font-mono text-foreground">
                      {device.hostname}
                    </span>
                  </div>
                )}
                {device.metadata.ip && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IP</span>
                    <span className="font-mono text-foreground">
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
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Utilisateur
              </h3>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-primary">
                  <HugeiconsIcon
                    icon={UserIcon}
                    size={16}
                    color="currentColor"
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <div className="font-medium text-foreground">
                    {device.metadata.lastUser}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Dernier connecté
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Model */}
          {device.metadata.model && (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
                <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  Connexions ({connectedDevices.length})
                </h3>
                <Button
                  variant={isCurrentDeviceHighlighted ? "secondary" : "outline"}
                  size="sm"
                  onClick={handleHighlightConnections}
                  className="h-6 gap-1 text-xs"
                >
                  {isCurrentDeviceHighlighted ? "Masquer" : "Voir sur plan"}
                  <ShortcutHintInline action="highlight-connections" />
                </Button>
              </div>
              <div className="space-y-1">
                {connectedDevices.map(
                  (connDevice) =>
                    connDevice && (
                      <button
                        key={connDevice.id}
                        onClick={() => handleSelectConnected(connDevice.id)}
                        className="group w-full rounded-lg bg-muted px-3 py-2 text-left transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-foreground group-hover:text-primary">
                              {connDevice.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
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
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
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
              <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-up" />
                  {
                    device.metadata.ports.filter((p) => p.status === "up")
                      .length
                  }{" "}
                  actifs
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-down" />
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
            <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Position
            </h3>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">X:</span>{" "}
                <span className="font-mono text-foreground">
                  {device.position.x}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Y:</span>{" "}
                <span className="font-mono text-foreground">
                  {device.position.y}
                </span>
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>

      {/* Footer actions */}
      {isEditMode && (
        <footer className="space-y-2 border-t border-border bg-muted p-4">
          <Button
            variant="destructive"
            onClick={handleDeleteDevice}
            className="w-full gap-2"
          >
            <HugeiconsIcon
              icon={WasteIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
            Supprimer
            <ShortcutHintInline action="delete-device" />
          </Button>
        </footer>
      )}
    </aside>
  );
}
