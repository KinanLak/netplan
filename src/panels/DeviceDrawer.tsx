import { useReactFlow } from "@xyflow/react";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Edit02Icon,
  LocationRemove01Icon,
  UserIcon,
  WasteIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import type { DeviceId } from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import {
  useMapDocumentActions,
  useMapDocumentData,
} from "@/map-session/useMapDocument";
import {
  useIsEditMode,
  useSelectedDeviceId,
  useShownCablesDeviceId,
} from "@/store/selectors";
import { Badge } from "@/components/ui/badge";
import { CopyValue } from "@/components/copy-value";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { StatusDot } from "@/components/StatusDot";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { TRACED_ON_ASK, toggledCableDisplay } from "@/canvas/cablePaths";
import { cn } from "@/lib/utils";
import { DrawerConnectionsSection } from "@/panels/drawer/DrawerConnectionsSection";
import { DrawerPortsSection } from "@/panels/drawer/DrawerPortsSection";
import { DeviceIdentityDialog } from "@/panels/drawer/DeviceIdentityDialog";
import { PortTableDialog } from "@/panels/drawer/PortTableDialog";
import {
  DeviceHistoryDialog,
  HAS_HISTORY,
} from "@/history/DeviceHistoryDialog";
import { useCanEdit } from "@/hooks/use-current-user";
import { useCurrentSite } from "@/sites/useCurrentSite";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import { comparePorts, deviceConnections } from "@/devices/ports";

export default function DeviceDrawer() {
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const shownCablesDeviceId = useShownCablesDeviceId();

  const selectDevice = useMapStore((s) => s.selectDevice);
  const showCables = useMapStore((s) => s.showCables);

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
  // History is read by role, in or out of edit mode (ADR 0027).
  const canEdit = useCanEdit();
  const { site } = useCurrentSite();
  const [historyDeviceId, setHistoryDeviceId] = useState<DeviceId | null>(null);
  useShortcutIntentEffect("show-device-history", () =>
    setHistoryDeviceId(selectedDeviceId),
  );

  const deviceById = new Map(devices.map((item) => [item.id, item]));
  const device = selectedDeviceId
    ? deviceById.get(selectedDeviceId)
    : undefined;

  const connections = device ? deviceConnections(cables, ports, device.id) : [];
  const devicePorts = device
    ? ports.filter((port) => port.deviceId === device.id).sort(comparePorts)
    : [];

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
    selectDevice(deviceId);
  };

  const handleCloseDrawer = () => {
    showCables(null);
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
            <h2
              className="truncate text-lg font-semibold text-foreground"
              title={device.name}
            >
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

        {TRACED_ON_ASK.has(device.type) ? (
          <Button
            type="button"
            variant={
              shownCablesDeviceId === device.id ? "secondary" : "outline"
            }
            size="sm"
            onClick={() =>
              showCables(toggledCableDisplay(shownCablesDeviceId, device))
            }
            className="w-full gap-1.5"
          >
            {shownCablesDeviceId === device.id
              ? "Masquer les câbles du plan"
              : "Voir les câbles sur le plan"}
            <ShortcutHintInline action="toggle-device-cables" />
          </Button>
        ) : null}

        {canEdit && HAS_HISTORY.has(device.type) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHistoryDeviceId(device.id)}
            className="w-full gap-1.5"
          >
            <HugeiconsIcon
              icon={WorkHistoryIcon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
            Historique
            <ShortcutHintInline action="show-device-history" />
          </Button>
        ) : null}
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-4">
          {device.hostname || device.ip || device.macs.length > 0 ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Réseau
              </h3>
              <div className="space-y-2">
                {device.hostname ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">Hostname</span>
                    <CopyValue
                      value={device.hostname}
                      label="le hostname"
                      className="text-foreground"
                    />
                  </div>
                ) : null}
                {device.ip ? (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">IP</span>
                    <CopyValue
                      value={device.ip}
                      label="l'adresse IP"
                      className="text-foreground"
                    />
                  </div>
                ) : null}
                {device.macs.map((mac) => (
                  <div
                    key={mac}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground">MAC</span>
                    <CopyValue
                      value={mac}
                      label="l'adresse MAC"
                      className="text-foreground"
                    />
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
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">N° de série</span>
                    <CopyValue
                      value={device.serial}
                      label="le numéro de série"
                      className="text-foreground"
                    />
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
            // Folded again on another device.
            key={device.id}
            connections={connections}
            deviceById={deviceById}
            onSelectConnected={handleSelectConnected}
          />

          <DrawerPortsSection
            ports={devicePorts}
            onShowCables={() => setCablesDeviceId(device.id)}
          />
        </div>
      </ScrollArea>

      {isEditMode ? (
        <footer className="flex items-center gap-2 border-t border-border bg-muted px-4 py-3">
          <Button
            variant="outline"
            onClick={() => setIdentityDeviceId(device.id)}
            className="flex-1 gap-2"
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
            size="icon"
            onClick={() => {
              unplaceDevice(device.id);
              selectDevice(null);
            }}
            aria-label="Retirer du plan"
            title="Retirer du plan (U)"
          >
            <HugeiconsIcon
              icon={LocationRemove01Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.5}
            />
          </Button>
          {/* A sourced device comes back at each sync, so it is never deleted. */}
          {device.source ? null : (
            <Button
              variant="destructive"
              size="icon"
              onClick={handleDeleteDevice}
              aria-label="Supprimer"
              title="Supprimer (Suppr)"
            >
              <HugeiconsIcon
                icon={WasteIcon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
              />
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
      {site ? (
        <DeviceHistoryDialog
          device={device}
          timezone={site.timezone}
          open={
            canEdit &&
            HAS_HISTORY.has(device.type) &&
            historyDeviceId === device.id
          }
          onOpenChange={(open) => setHistoryDeviceId(open ? device.id : null)}
        />
      ) : null}
    </aside>
  );
}
