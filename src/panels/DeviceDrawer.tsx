import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserIcon, WasteIcon } from "@hugeicons/core-free-icons";
import type { DeviceStatus } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import {
  useDevices,
  useHighlightedDeviceIds,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import { useShortcut } from "@/hooks/use-shortcuts";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { StatusDot } from "@/components/StatusDot";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { cn } from "@/lib/utils";
import { DrawerConnectionsSection } from "@/panels/drawer/DrawerConnectionsSection";
import { DrawerPortsSection } from "@/panels/drawer/DrawerPortsSection";

const statusLabels: Record<DeviceStatus, string> = {
  up: "En ligne",
  down: "Hors ligne",
  unknown: "Inconnu",
};

export default function DeviceDrawer() {
  const devices = useDevices();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const highlightedDeviceIds = useHighlightedDeviceIds();

  const selectDevice = useMapStore((s) => s.selectDevice);
  const deleteDevice = useMapStore((s) => s.deleteDevice);
  const setHighlightedDevices = useMapStore((s) => s.setHighlightedDevices);

  const reactFlow = useReactFlow();

  const device = devices.find((d) => d.id === selectedDeviceId);

  // Get connected devices
  const connectedDevices =
    device?.metadata.connectedDeviceIds
      ?.map((id) => devices.find((d) => d.id === id))
      .filter((d): d is (typeof devices)[number] => d !== undefined) ?? [];

  // Check if the currently highlighted devices belong to this device
  const isCurrentDeviceHighlighted = (() => {
    if (
      !device?.metadata.connectedDeviceIds ||
      highlightedDeviceIds.length === 0
    )
      return false;
    // Check if highlighted devices include this device and its connections
    const allIds = [device.id, ...device.metadata.connectedDeviceIds];
    return allIds.every((id) => highlightedDeviceIds.includes(id));
  })();

  const handleHighlightConnections = () => {
    if (!device?.metadata.connectedDeviceIds) return;

    // If this device's connections are highlighted, hide them. Otherwise, show this device's connections.
    if (isCurrentDeviceHighlighted) {
      setHighlightedDevices([]);
    } else {
      // Include the device itself and its connections
      setHighlightedDevices([device.id, ...device.metadata.connectedDeviceIds]);
    }
  };

  const handleSelectConnected = (deviceId: string) => {
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
  };

  const handleCloseDrawer = () => {
    setHighlightedDevices([]);
    selectDevice(null);
  };

  const handleDeleteDevice = () => {
    if (!device) return;
    deleteDevice(device.id);
    selectDevice(null);
  };

  // Register keyboard shortcuts (scope is automatic via useScopeEnabled)
  useShortcut("close-drawer", handleCloseDrawer, {
    conflictBehavior: "allow",
  });
  useShortcut("delete-device", handleDeleteDevice, { enabled: isEditMode });
  useShortcut("highlight-connections", handleHighlightConnections, {
    conflictBehavior: "allow",
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
              {getDeviceKindLabel(device.type)}
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
          <StatusDot status={status} className="size-4" />
          {statusLabels[status]}
        </span>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-4">
          {/* Hostname & IP */}
          {device.hostname || device.metadata.ip ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Réseau
              </h3>
              <div className="space-y-2">
                {device.hostname ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Hostname</span>
                    <span className="font-mono text-foreground">
                      {device.hostname}
                    </span>
                  </div>
                ) : null}
                {device.metadata.ip ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IP</span>
                    <span className="font-mono text-foreground">
                      {device.metadata.ip}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* Last user (for PCs) */}
          {device.type === "pc" && device.metadata.lastUser ? (
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
          ) : null}

          {/* Model */}
          {device.metadata.model ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Matériel
              </h3>
              <div className="text-sm">
                <span className="text-foreground">{device.metadata.model}</span>
              </div>
            </section>
          ) : null}

          {/* Connected devices */}
          <DrawerConnectionsSection
            connectedDevices={connectedDevices}
            isCurrentDeviceHighlighted={isCurrentDeviceHighlighted}
            onHighlightConnections={handleHighlightConnections}
            onSelectConnected={handleSelectConnected}
          />

          {/* Ports (for switches) */}
          {device.type === "switch" && device.metadata.ports ? (
            <DrawerPortsSection ports={device.metadata.ports} />
          ) : null}

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
      {isEditMode ? (
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
      ) : null}
    </aside>
  );
}
