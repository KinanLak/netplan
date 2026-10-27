import { useReactFlow, useStoreApi } from "@xyflow/react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createDevicePlacement } from "@/devices/devicePlacement";
import {
  placeAround,
  unplacedDeviceOf,
  viewportCentre,
} from "@/devices/placeFromInventory";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useCurrentSite } from "@/sites/useCurrentSite";
import { useCurrentFloorId } from "@/store/selectors";
import type { Position } from "@/types/map";
import { api } from "../../convex/_generated/api";

export type InventoryRow = FunctionReturnType<
  typeof api.devices.listForSite
>[number];

/** What a dragged inventory row carries: its device id. */
export const INVENTORY_DEVICE_MIME = "application/x-netplan-device";

/**
 * The site's inventory, and a way to put one of its devices on the current
 * floor around a point (C2): by a click at the middle of the view, or by a
 * drop where it lands. Returns why it could not, or `null` once placed.
 */
export const usePlaceFromInventory = () => {
  const { site } = useCurrentSite();
  const devices = useQuery(
    api.devices.listForSite,
    site ? { siteId: site.id } : "skip",
  );
  const floorId = useCurrentFloorId();
  const { commands } = useMapDocumentActions();
  const flow = useStoreApi();
  const reactFlow = useReactFlow();

  const place = (deviceId: string, centre: Position): string | null => {
    const row = devices?.find((device) => device.id === deviceId);
    if (!floorId || !row) return "Cet équipement n'est plus dans l'inventaire.";
    if (row.location) return "Cet équipement est déjà sur un plan.";
    const device = placeAround(
      unplacedDeviceOf(row),
      floorId,
      centre,
      createDevicePlacement({ checkCollision: commands.checkCollision }),
    );
    if (!device) return "Aucune place libre à cet endroit.";
    if (!commands.placeDevice(device)) {
      return "Cet équipement ne peut pas être placé ici.";
    }
    return null;
  };

  /** Places at the middle of the visible plan. */
  const placeAtCentre = (deviceId: string) =>
    place(deviceId, viewportCentre(flow.getState()));

  /** Places where a pointer on the screen points. */
  const placeAtPointer = (deviceId: string, screen: Position) =>
    place(deviceId, reactFlow.screenToFlowPosition(screen));

  return { site, devices, placeAtCentre, placeAtPointer };
};
