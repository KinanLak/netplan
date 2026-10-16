import { useStoreApi } from "@xyflow/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { createDevicePlacement } from "@/devices/devicePlacement";
import { placeAround, viewportCentre } from "@/devices/placeFromInventory";
import { matchesDeviceSearch } from "@/devices/search";
import { asDeviceId } from "@/lib/objectIds";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useCurrentSite } from "@/sites/useCurrentSite";
import { useCurrentFloorId } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import { api } from "../../convex/_generated/api";

type InventoryRow = FunctionReturnType<typeof api.devices.listForSite>[number];

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** Picks a device of the site inventory that is on no floor and puts it on this one. */
export function PlaceDeviceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Placer un équipement"
      description="Les équipements du site qui ne sont sur aucun étage."
    >
      {/* Mounted on open, so the search and any error start empty. */}
      {open ? <PlaceDeviceList onDone={() => onOpenChange(false)} /> : null}
    </CommandDialog>
  );
}

function PlaceDeviceList({ onDone }: { onDone: () => void }) {
  const { site } = useCurrentSite();
  const devices = useQuery(
    api.devices.listForSite,
    site ? { siteId: site.id } : "skip",
  );
  const floorId = useCurrentFloorId();
  const { commands } = useMapDocumentActions();
  const flow = useStoreApi();
  const selectDevice = useMapStore((state) => state.selectDevice);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  const unplaced = devices
    ?.filter((device) => !device.location)
    .sort((a, b) => byName.compare(a.name, b.name));
  const shown = unplaced?.filter((device) =>
    matchesDeviceSearch(device, query),
  );

  const place = (row: InventoryRow) => {
    if (!floorId) return;
    const { location: _location, ...identity } = row;
    const device = placeAround(
      { ...identity, id: asDeviceId(row.id) },
      floorId,
      viewportCentre(flow.getState()),
      createDevicePlacement({ checkCollision: commands.checkCollision }),
    );
    if (!device) {
      setError(
        "Aucune place libre au centre de la vue : déplacez-la puis réessayez.",
      );
      return;
    }
    if (!commands.placeDevice(device)) {
      setError("Cet équipement ne peut pas être placé ici.");
      return;
    }
    selectDevice(device.id);
    onDone();
  };

  return (
    <Command shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Nom, hostname, MAC, IP…"
      />
      <CommandList>
        <CommandEmpty>
          {unplaced === undefined
            ? "Chargement…"
            : unplaced.length === 0
              ? "Tous les équipements du site sont sur le plan."
              : "Aucun équipement ne correspond."}
        </CommandEmpty>
        {shown?.map((device) => (
          <CommandItem
            key={device.id}
            value={device.id}
            onSelect={() => place(device)}
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate">{device.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  getDeviceKindLabel(device.type),
                  device.hostname,
                  device.macs[0],
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </CommandItem>
        ))}
      </CommandList>
      {error ? (
        <p role="alert" className="px-3 pt-1 pb-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </Command>
  );
}
