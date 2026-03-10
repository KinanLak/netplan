import { useReactFlow } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, UserIcon, WasteIcon } from "@hugeicons/core-free-icons";
import type { DeviceStatus } from "@/types/map";
import { getConnectedDeviceIds } from "@/domain/map/selectors";
import { useMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";
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
import { cn } from "@/lib/utils";
import { DrawerConnectionsSection } from "@/panels/drawer/DrawerConnectionsSection";
import { DrawerPortsSection } from "@/panels/drawer/DrawerPortsSection";

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
  const devices = useDevices();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const highlightedDeviceIds = useHighlightedDeviceIds();

  const document = useMapStore((state) => state.document);
  const deleteDevice = useMapStore((state) => state.deleteDevice);
  const selectDevice = useMapUiStore((state) => state.selectDevice);
  const setHighlightedDevices = useMapUiStore(
    (state) => state.setHighlightedDevices,
  );

  const reactFlow = useReactFlow();
  const device = devices.find((candidate) => candidate.id === selectedDeviceId);
  const connectedDeviceIds = device
    ? getConnectedDeviceIds(document, device.id)
    : [];
  const connectedDevices = connectedDeviceIds
    .map((deviceId) => devices.find((candidate) => candidate.id === deviceId))
    .filter((candidate): candidate is (typeof devices)[number] =>
      Boolean(candidate),
    );

  const isCurrentDeviceHighlighted =
    device !== undefined &&
    highlightedDeviceIds.length > 0 &&
    [device.id, ...connectedDeviceIds].every((id) =>
      highlightedDeviceIds.includes(id),
    );

  const handleHighlightConnections = () => {
    if (!device || connectedDeviceIds.length === 0) return;

    if (isCurrentDeviceHighlighted) {
      setHighlightedDevices([]);
    } else {
      setHighlightedDevices([device.id, ...connectedDeviceIds]);
    }
  };

  const handleSelectConnected = (deviceId: string) => {
    const targetDevice = devices.find((candidate) => candidate.id === deviceId);
    if (targetDevice) {
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
    deleteDevice({ deviceId: device.id });
  };

  useShortcut("close-drawer", handleCloseDrawer);
  useShortcut("delete-device", handleDeleteDevice, { enabled: isEditMode });
  useShortcut("highlight-connections", handleHighlightConnections, {
    enabled: connectedDeviceIds.length > 0,
  });

  if (!device) {
    return null;
  }

  const status = device.metadata.status ?? "unknown";

  return (
    <aside className="absolute top-0 right-0 z-20 flex h-full w-80 flex-col border-l border-border bg-card shadow-xl">
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

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-4">
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

          <DrawerConnectionsSection
            connectedDevices={connectedDevices}
            isCurrentDeviceHighlighted={isCurrentDeviceHighlighted}
            onHighlightConnections={handleHighlightConnections}
            onSelectConnected={handleSelectConnected}
          />

          {device.metadata.ports ? (
            <DrawerPortsSection ports={device.metadata.ports} />
          ) : null}
        </div>
      </ScrollArea>

      {isEditMode ? (
        <footer className="border-t p-4">
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleDeleteDevice}
          >
            <HugeiconsIcon
              icon={WasteIcon}
              size={18}
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
