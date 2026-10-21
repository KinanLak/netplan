import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { useCurrentSite } from "@/sites/useCurrentSite";
import { useMapStore } from "@/store/useMapStore";
import { api } from "../../convex/_generated/api";

export type SiteDevice = FunctionReturnType<
  typeof api.devices.listForSite
>[number];

/**
 * The site's devices, placed or not, and a way to bring a placed one into
 * view on its floor.
 */
export function useSiteDeviceLocator() {
  const { site } = useCurrentSite();
  const devices = useQuery(
    api.devices.listForSite,
    site ? { siteId: site.id } : "skip",
  );

  const locate = (device: SiteDevice, options: { select: boolean }) => {
    if (!device.location) return;
    useMapStore.getState().locateDevice(
      {
        deviceId: asDeviceId(device.id),
        buildingId: asBuildingId(device.location.buildingId),
        floorId: asFloorId(device.location.floorId),
      },
      options,
    );
  };

  return { site, devices, locate };
}
