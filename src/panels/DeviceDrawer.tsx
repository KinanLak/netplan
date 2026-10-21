import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Edit02Icon,
  LocationRemove01Icon,
  WasteIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import type { DeviceId, PortId } from "@/types/map";
import { portLabel, shortPortName } from "@/devices/portState";
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
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { TRACED_ON_ASK, toggledCableDisplay } from "@/canvas/cablePaths";
import {
  DeviceHeading,
  DeviceIdentitySections,
  LastSeenSection,
  StatusChip,
} from "@/panels/drawer/DeviceDetails";
import { DrawerConnectionsSection } from "@/panels/drawer/DrawerConnectionsSection";
import { DrawerPortsSection } from "@/panels/drawer/DrawerPortsSection";
import { DeviceIdentityDialog } from "@/panels/drawer/DeviceIdentityDialog";
import { PortTableDialog } from "@/panels/drawer/PortTableDialog";
import {
  DeviceHistoryDialog,
  HAS_HISTORY,
} from "@/history/DeviceHistoryDialog";
import { useCanEdit } from "@/hooks/use-current-user";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { hasStatus } from "@/devices/status";
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

  // Held by device, so the dialog never reopens on another one.
  const [identityDeviceId, setIdentityDeviceId] = useState<DeviceId | null>(
    null,
  );
  useShortcutIntentEffect("edit-device-identity", () =>
    setIdentityDeviceId(selectedDeviceId),
  );
  const [cablesDeviceId, setCablesDeviceId] = useState<DeviceId | null>(null);
  const [cablesPortId, setCablesPortId] = useState<PortId | null>(null);
  const showPortCables = (deviceId: DeviceId | null, portId?: PortId) => {
    setCablesPortId(portId ?? null);
    setCablesDeviceId(deviceId);
  };
  useShortcutIntentEffect("show-port-cables", () =>
    showPortCables(selectedDeviceId),
  );
  // History is read by role, in or out of edit mode (ADR 0027).
  const canEdit = useCanEdit();
  const [historyDeviceId, setHistoryDeviceId] = useState<DeviceId | null>(null);
  useShortcutIntentEffect("show-device-history", () =>
    setHistoryDeviceId(selectedDeviceId),
  );

  const deviceById = new Map(devices.map((item) => [item.id, item]));
  const device = selectedDeviceId
    ? deviceById.get(selectedDeviceId)
    : undefined;

  const connections = device ? deviceConnections(cables, ports, device.id) : [];
  const farEnds = new Map(
    connections.flatMap(({ port, far, farPort }) => {
      const other = deviceById.get(far.deviceId);
      if (!other) return [];
      const farName =
        farPort && other.type === "patch-panel"
          ? `${other.name} ${portLabel(farPort, other.type)}`
          : farPort && other.type === "switch"
            ? `${other.name} ${shortPortName(farPort.name)}`
            : other.name;
      return [[port.id, farName] as const];
    }),
  );
  const devicePorts = device
    ? ports.filter((port) => port.deviceId === device.id).sort(comparePorts)
    : [];

  const handleSelectConnected = (deviceId: DeviceId) => {
    const targetDevice = devices.find((d) => d.id === deviceId);
    const { currentBuildingId, locateDevice } = useMapStore.getState();
    if (targetDevice && currentBuildingId) {
      locateDevice(
        {
          deviceId,
          buildingId: currentBuildingId,
          floorId: targetDevice.floorId,
        },
        { select: true },
      );
    } else {
      selectDevice(deviceId);
    }
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
            <DeviceHeading device={device} />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseDrawer}
              className="flex h-8 items-center gap-1.5 px-2"
            >
              <Kbd>Échap</Kbd>
              <HugeiconsIcon
                icon={Cancel01Icon}
                size={18}
                color="currentColor"
                strokeWidth={1.5}
              />
            </Button>
          </div>
        </div>

        {/* A passive device has no status (B13). */}
        {hasStatus(device.type) ? (
          <StatusChip status={status} lastSeenAt={device.metadata.lastSeenAt} />
        ) : null}

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
          <DeviceIdentitySections device={device} />
          <LastSeenSection deviceId={device.id} />

          <DrawerConnectionsSection
            // Folded again on another device.
            key={device.id}
            deviceType={device.type}
            connections={connections}
            deviceById={deviceById}
            onSelectConnected={handleSelectConnected}
          />

          <DrawerPortsSection
            ports={devicePorts}
            deviceType={device.type}
            farEnds={farEnds}
            onShowCables={(portId) => showPortCables(device.id, portId)}
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
        onOpenChange={(open) => showPortCables(open ? device.id : null)}
        focusPortId={cablesPortId}
      />
      <DeviceHistoryDialog
        device={device}
        open={
          canEdit &&
          HAS_HISTORY.has(device.type) &&
          historyDeviceId === device.id
        }
        onOpenChange={(open) => setHistoryDeviceId(open ? device.id : null)}
      />
    </aside>
  );
}
