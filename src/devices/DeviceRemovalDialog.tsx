import { create } from "zustand";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceId } from "@/types/map";

type RemovalRequest =
  | { kind: "unplace"; deviceIds: ReadonlyArray<DeviceId> }
  | { kind: "delete"; deviceId: DeviceId; name: string };

/** The removal waiting for the user's word, if any. */
export const useDeviceRemoval = create<{
  request: RemovalRequest | null;
  ask: (request: RemovalRequest) => void;
  close: () => void;
}>((set) => ({
  request: null,
  ask: (request) => set({ request }),
  close: () => set({ request: null }),
}));

/**
 * Takes devices off the plan, asking first when there are several; one
 * comes off at once, and undo brings it back (ADR 0030).
 */
export function useUnplaceDevices() {
  const { commands } = useMapDocumentActions();
  const ask = useDeviceRemoval((state) => state.ask);
  return (deviceIds: ReadonlyArray<DeviceId>) => {
    if (deviceIds.length === 0) return;
    if (deviceIds.length > 1) {
      ask({ kind: "unplace", deviceIds });
      return;
    }
    commands.unplaceDevices(deviceIds);
    useMapStore.getState().setSelectedDevices([]);
  };
}

/**
 * Confirms taking several devices off the plan, or deleting one from the
 * site: both are undone with Ctrl+Z, but deleting also drops its cables
 * from the inventory, so it always asks.
 */
export function DeviceRemovalDialog() {
  const request = useDeviceRemoval((state) => state.request);
  const close = useDeviceRemoval((state) => state.close);
  const { commands } = useMapDocumentActions();

  const confirm = () => {
    if (!request) return;
    if (request.kind === "unplace") {
      commands.unplaceDevices(request.deviceIds);
      useMapStore.getState().setSelectedDevices([]);
    } else if (commands.deleteDevice(request.deviceId)) {
      useMapStore.getState().selectDevice(null);
    }
    close();
  };

  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {request?.kind === "delete"
              ? `Supprimer « ${request.name} » du site ?`
              : `Retirer ${request?.deviceIds.length ?? 0} équipements du plan ?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {request?.kind === "delete"
              ? "Il quitte l'inventaire avec ses câbles. Pour le garder hors du plan, choisissez plutôt « Retirer du plan »."
              : "Ils restent dans l'inventaire du site, avec leurs câbles."}{" "}
            Ctrl+Z annule.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            variant={request?.kind === "delete" ? "destructive" : "default"}
            onClick={confirm}
          >
            {request?.kind === "delete" ? "Supprimer" : "Retirer du plan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
