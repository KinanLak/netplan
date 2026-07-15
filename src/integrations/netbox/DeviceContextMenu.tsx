import { HugeiconsIcon } from "@hugeicons/react";
import { PlugSocketIcon, WasteIcon } from "@hugeicons/core-free-icons";
import {
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useLinkedSocketActions } from "@/integrations/netbox/useLinkedSocketActions";
import type { DeviceId } from "@/types/map";

export function DeviceContextMenu({ deviceId }: { deviceId: DeviceId }) {
  const actions = useLinkedSocketActions(deviceId);
  if (!actions.device) return null;

  return (
    <ContextMenuContent className="min-w-56">
      <ContextMenuGroup>
        <ContextMenuLabel>{actions.device.name}</ContextMenuLabel>
        <ContextMenuItem onClick={() => actions.focusDevice(deviceId)}>
          Ouvrir la fiche
        </ContextMenuItem>
        {actions.isLoading ? (
          <ContextMenuItem disabled>Recherche de la prise…</ContextMenuItem>
        ) : actions.placedSocket && actions.discovery ? (
          <ContextMenuItem
            onClick={() => actions.focusDevice(actions.placedSocket!.id)}
          >
            <HugeiconsIcon icon={PlugSocketIcon} />
            Voir la prise {actions.discovery.socketName}
          </ContextMenuItem>
        ) : actions.socketItem && actions.discovery && actions.isEditMode ? (
          <ContextMenuItem onClick={actions.placeLinkedSocket}>
            <HugeiconsIcon icon={PlugSocketIcon} />
            Placer la prise {actions.discovery.socketName}
          </ContextMenuItem>
        ) : null}
      </ContextMenuGroup>
      {actions.isEditMode ? (
        <>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              variant="destructive"
              onClick={actions.deleteDevice}
            >
              <HugeiconsIcon icon={WasteIcon} />
              Supprimer de la carte
            </ContextMenuItem>
          </ContextMenuGroup>
        </>
      ) : null}
    </ContextMenuContent>
  );
}
