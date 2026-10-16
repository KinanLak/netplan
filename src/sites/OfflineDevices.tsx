import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { StatusDot } from "@/components/StatusDot";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { asBuildingId, asDeviceId, asFloorId } from "@/lib/objectIds";
import { useMapStore } from "@/store/useMapStore";
import { api } from "../../convex/_generated/api";

// The rest are one click away in the inventory, filtered.
const SHOWN = 8;

/**
 * The site's devices the collection last saw offline, each opened on its
 * floor (ADR 0026). Nothing when none is.
 */
export function OfflineDevices({ siteId }: { siteId: string }) {
  const offline = useQuery(api.devices.offlineForSite, { siteId });
  if (!offline || offline.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Hors ligne ({offline.length})</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {offline.slice(0, SHOWN).map(({ id, name, location }) => (
            <SidebarMenuItem key={id}>
              <SidebarMenuButton
                disabled={!location}
                title={location ? undefined : "Pas encore placé sur le plan"}
                onClick={() => {
                  if (!location) return;
                  const { setCurrentBuilding, setCurrentFloor, selectDevice } =
                    useMapStore.getState();
                  setCurrentBuilding(asBuildingId(location.buildingId));
                  setCurrentFloor(asFloorId(location.floorId));
                  selectDevice(asDeviceId(id));
                }}
              >
                <StatusDot status="down" decorative className="shrink-0" />
                <span className="truncate">{name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {location?.floorName ?? "Hors plan"}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {offline.length > SHOWN ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                className="text-muted-foreground"
                render={
                  <Link
                    to="/inventory"
                    search={{ site: siteId, status: "down" }}
                  />
                }
              >
                Voir les {offline.length - SHOWN} autres dans l'inventaire
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
