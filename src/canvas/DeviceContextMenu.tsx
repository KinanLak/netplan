import { isDeletable } from "@/devices/identity";
import { HugeiconsIcon } from "@hugeicons/react";
import { LocationRemove01Icon, WasteIcon } from "@hugeicons/core-free-icons";
import { useReactFlow } from "@xyflow/react";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  useMapDocumentActions,
  useMapDocumentData,
} from "@/map-session/useMapDocument";
import { TRACED_ON_ASK, toggledCableDisplay } from "@/canvas/cablePaths";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { useIsEditMode, useShownCablesDeviceId } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceId } from "@/types/map";
import { useDeviceRemoval } from "@/devices/DeviceRemovalDialog";

export function DeviceContextMenu({ deviceId }: { deviceId: DeviceId }) {
  const isEditMode = useIsEditMode();
  const { document } = useMapDocumentData();
  const { commands } = useMapDocumentActions();
  const reactFlow = useReactFlow();
  const selectDevice = useMapStore((state) => state.selectDevice);
  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);
  const shownCablesDeviceId = useShownCablesDeviceId();
  const showCables = useMapStore((state) => state.showCables);

  const device = document.devices.find(
    (candidate) => candidate.id === deviceId,
  );
  if (!device) return null;

  const openDevice = () => {
    setActiveDrawTool("device");
    selectDevice(device.id);
    window.requestAnimationFrame(() => {
      reactFlow.setCenter(
        device.position.x + device.size.width / 2,
        device.position.y + device.size.height / 2,
        { duration: 450, zoom: Math.max(reactFlow.getZoom(), 0.8) },
      );
    });
  };

  const deleteDevice = () => {
    useDeviceRemoval
      .getState()
      .ask({ kind: "delete", deviceId: device.id, name: device.name });
  };

  const unplaceDevice = () => {
    commands.unplaceDevice(device.id);
    selectDevice(null);
  };

  return (
    <ContextMenuContent className="min-w-56">
      <ContextMenuGroup>
        <ContextMenuLabel>{device.name}</ContextMenuLabel>
        <ContextMenuItem onClick={openDevice}>Ouvrir la fiche</ContextMenuItem>
        {TRACED_ON_ASK.has(device.type) ? (
          <ContextMenuItem
            onClick={() =>
              showCables(toggledCableDisplay(shownCablesDeviceId, device))
            }
          >
            {shownCablesDeviceId === device.id
              ? "Masquer les câbles du plan"
              : "Voir les câbles sur le plan"}
            <ShortcutHintInline action="toggle-device-cables" />
          </ContextMenuItem>
        ) : null}
      </ContextMenuGroup>
      {isEditMode ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem onClick={unplaceDevice}>
              <HugeiconsIcon icon={LocationRemove01Icon} />
              Retirer du plan
            </ContextMenuItem>
            {/* A sourced device comes back at each sync, so it is never
                deleted, unless its source no longer returns it (ADR 0039). */}
            {!isDeletable(device) ? null : (
              <ContextMenuItem variant="destructive" onClick={deleteDevice}>
                <HugeiconsIcon icon={WasteIcon} />
                Supprimer
              </ContextMenuItem>
            )}
          </ContextMenuGroup>
        </>
      ) : null}
    </ContextMenuContent>
  );
}
