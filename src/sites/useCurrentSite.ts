import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { asSiteId } from "@/lib/objectIds";
import { useCurrentBuildingId } from "@/store/selectors";
import type { SiteId } from "@/types/map";

export const useCurrentSiteId = (): SiteId | null => {
  const currentBuildingId = useCurrentBuildingId();
  const buildings = useQuery(api.buildings.list);
  const siteId = buildings?.find(
    (building) => building.id === currentBuildingId,
  )?.siteId;
  return siteId ? asSiteId(siteId) : null;
};
