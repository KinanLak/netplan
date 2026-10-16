import { useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Edit02Icon,
  LocationRemove01Icon,
  UserIcon,
  WasteIcon,
} from "@hugeicons/core-free-icons";
import type { DeviceId } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import {
  useMapDocumentActions,
  useMapDocumentData,
} from "@/map-session/useMapDocument";
import {
  useHighlightedDeviceIds,
  useIsEditMode,
  useSelectedDeviceId,
} from "@/store/selectors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { StatusDot } from "@/components/StatusDot";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { getNextConnectionHighlightIds } from "@/lib/shortcut-intents";
import { cn } from "@/lib/utils";
import { DrawerConnectionsSection } from "@/panels/drawer/DrawerConnectionsSection";
import type { ConnectedDeviceSummary } from "@/panels/drawer/DrawerConnectionsSection";
import { DrawerPortsSection } from "@/panels/drawer/DrawerPortsSection";
import { DeviceIdentityDialog } from "@/panels/drawer/DeviceIdentityDialog";
import { PortTableDialog } from "@/panels/drawer/PortTableDialog";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import { cabledDeviceIds, comparePorts } from "@/devices/ports";

export default function DeviceDrawer() {
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const highlightedDeviceIds = useHighlightedDeviceIds();

  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHighlightedDevices = useMapStore((s) => s.setHighlightedDevices);

  const { document } = useMapDocumentData();
  const { commands } = useMapDocumentActions();
  const { devices, ports, cables } = document;
  const { deleteDevice, unplaceDevice } = commands;

  const reactFlow = useReactFlow();
  // Held by device, so the dialog never reopens on another one.
  const [identityDeviceId, setIdentityDeviceId] = useState<DeviceId | null>(
    null,
  );
  useShortcutIntentEffect("edit-device-identity", () =>
    setIdentityDeviceId(selectedDeviceId),
  );
  const [cablesDeviceId, setCablesDeviceId] = useState<DeviceId | null>(null);
  useShortcutIntentEffect("show-port-cables", () =>
    setCablesDeviceId(selectedDeviceId),
  );

  const deviceById = new Map(devices.map((item) => [item.id, item]));
  const device = selectedDeviceId
    ? deviceById.get(selectedDeviceId)
    : undefined;

  // Only the cabled devices on this floor; the drawer cannot jump to another.
  const connectedDevices: Array<ConnectedDeviceSummary> = device
    ? cabledDeviceIds(cables, device.id).flatMap((otherId) => {
        const other = deviceById.get(otherId);
        return other
          ? [
              {
                id: other.id,
                name: other.name,
                type: other.type,
                status: other.metadata.status ?? "unknown",
              },
            ]
          : [];
      })
    : [];
  const devicePorts = device
    ? ports.filter((port) => port.deviceId === device.id).sort(comparePorts)
    : [];

  const isCurrentDeviceHighlighted = (() => {
    if (!device || connectedDevices.length === 0) return false;
    if (highlightedDeviceIds.length === 0) return false;
    const highlightedIdSet = new Set(highlightedDeviceIds);
    const allIds = [device.id, ...connectedDevices.map((c) => c.id)];
    return allIds.every((id) => highlightedIdSet.has(id));
  })();

  const handleHighlightConnections = () => {
    const next = getNextConnectionHighlightIds({
      cables,
      devices,
      highlightedDeviceIds,
      hoveredDeviceId: null,
      selectedDeviceId,
    });

    if (next) {
      setHighlightedDevices(next);
    }
  };

  const handleSelectConnected = (deviceId: DeviceId) => {
    const targetDevice = devices.find((d) => d.id === deviceId);
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
    if (deleteDevice(device.id)) selectDevice(null);
  };

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
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {getDeviceKindLabel(device.type)}
              {device.source ? (
                <Badge
                  variant="outline"
                  render={
                    device.source.url ? (
                      <a
                        href={device.source.url}
                        target="_blank"
                        rel="noreferrer"
                        title={`Ouvrir dans ${INTEGRATION_LABELS[device.source.integration]}`}
                      />
                    ) : undefined
                  }
                >
                  {INTEGRATION_LABELS[device.source.integration]}
                </Badge>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1">
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
          {DEVICE_STATUS_LABELS[status]}
        </span>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-4 px-4 py-4">
          {device.hostname || device.ip || device.macs.length > 0 ? (
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
                {device.ip ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">IP</span>
                    <span className="font-mono text-foreground">
                      {device.ip}
                    </span>
                  </div>
                ) : null}
                {device.macs.map((mac) => (
                  <div key={mac} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">MAC</span>
                    <span className="font-mono text-foreground">{mac}</span>
                  </div>
                ))}
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

          {device.model || device.serial ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Matériel
              </h3>
              <div className="space-y-2">
                {device.model ? (
                  <div className="text-sm">
                    <span className="text-foreground">{device.model}</span>
                  </div>
                ) : null}
                {device.serial ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">N° de série</span>
                    <span className="font-mono text-foreground">
                      {device.serial}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {device.notes ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Notes
              </h3>
              <p className="text-sm whitespace-pre-wrap text-foreground">
                {device.notes}
              </p>
            </section>
          ) : null}

          <DrawerConnectionsSection
            connectedDevices={connectedDevices}
            isCurrentDeviceHighlighted={isCurrentDeviceHighlighted}
            onHighlightConnections={handleHighlightConnections}
            onSelectConnected={handleSelectConnected}
          />

          <DrawerPortsSection
            ports={devicePorts}
            onShowCables={() => setCablesDeviceId(device.id)}
          />

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

      {isEditMode ? (
        <footer className="space-y-2 border-t border-border bg-muted p-4">
          <Button
            variant="outline"
            onClick={() => setIdentityDeviceId(device.id)}
            className="w-full gap-2"
          >
            <HugeiconsIcon
              icon={Edit02Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
            Modifier l'identité
            <ShortcutHintInline action="edit-device-identity" />
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              unplaceDevice(device.id);
              selectDevice(null);
            }}
            className="w-full gap-2"
          >
            <HugeiconsIcon
              icon={LocationRemove01Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
            Retirer du plan
            <ShortcutHintInline action="unplace-device" />
          </Button>
          {/* A sourced device comes back at each sync, so it is never deleted. */}
          {device.source ? null : (
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
          )}
        </footer>
      ) : null}
      <DeviceIdentityDialog
        device={device}
        open={isEditMode && identityDeviceId === device.id}
        onOpenChange={(open) => setIdentityDeviceId(open ? device.id : null)}
      />
      <PortTableDialog
        device={device}
        editable={isEditMode}
        open={cablesDeviceId === device.id}
        onOpenChange={(open) => setCablesDeviceId(open ? device.id : null)}
      />
    </aside>
  );
}
