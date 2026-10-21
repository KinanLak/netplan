import { useState } from "react";
import type { DragEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateDeviceDialog } from "@/devices/CreateDeviceDialog";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { matchesDeviceSearch } from "@/devices/search";
import {
  INVENTORY_DEVICE_MIME,
  usePlaceFromInventory,
} from "@/devices/usePlaceFromInventory";
import type { InventoryRow } from "@/devices/usePlaceFromInventory";
import { useMapDocumentReady } from "@/map-session/useMapDocument";
import { useIsEditMode, useIsPlacePanelOpen } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import { cn } from "@/lib/utils";

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/**
 * The site's devices that are on no floor, to put on this one (C2): a click
 * places one in the middle of the view, a drag where it is dropped. The
 * panel stays open, so a floor fills one device after another, and a new
 * device joins the inventory from here.
 */
export function PlaceDevicePanel() {
  const isOpen = useIsPlacePanelOpen();
  const isEditMode = useIsEditMode();
  if (!isOpen || !isEditMode) return null;
  return <PlaceDevicePanelContent />;
}

function PlaceDevicePanelContent() {
  const { site, devices, placeAtCentre } = usePlaceFromInventory();
  const isReady = useMapDocumentReady();
  const setPlacePanelOpen = useMapStore((s) => s.setPlacePanelOpen);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const unplaced = devices
    ?.filter((device) => !device.location)
    .sort((a, b) => byName.compare(a.name, b.name));
  const shown = unplaced?.filter((device) =>
    matchesDeviceSearch(device, query),
  );

  const place = (row: InventoryRow) => {
    setError(placeAtCentre(row.id));
  };

  const startDrag = (
    event: DragEvent<HTMLButtonElement>,
    row: InventoryRow,
  ) => {
    event.dataTransfer.setData(INVENTORY_DEVICE_MIME, row.id);
    event.dataTransfer.effectAllowed = "copy";
  };

  // A site without devices and a site whose devices are all placed are two
  // different dead ends, with the same way out (A15).
  const empty =
    devices === undefined
      ? "Chargement…"
      : devices.length === 0
        ? "L'inventaire de ce site est vide."
        : unplaced?.length === 0
          ? "Tous les équipements du site sont sur le plan."
          : shown?.length === 0
            ? "Aucun équipement ne correspond."
            : null;

  return (
    <div
      className="absolute top-4 right-4 z-20 flex max-h-[calc(100%-2rem)] w-72 flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg"
      aria-label="Placer un équipement"
      role="region"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Placer</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setPlacePanelOpen(false)}
          aria-label="Fermer le panneau Placer"
          title="Fermer"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cliquez pour placer au centre, ou glissez sur le plan.
      </p>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Nom, hostname, MAC, IP…"
        aria-label="Chercher dans l'inventaire"
        autoFocus
      />
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <p className="px-1 py-2 text-muted-foreground">{empty}</p>
        ) : (
          <ul className="flex flex-col">
            {shown?.map((device) => (
              <li key={device.id}>
                <button
                  type="button"
                  draggable={isReady}
                  disabled={!isReady}
                  onDragStart={(event) => startDrag(event, device)}
                  onClick={() => place(device)}
                  ref={(element) => {
                    if (element && device.id === created) {
                      element.scrollIntoView({ block: "nearest" });
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-grab flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent active:cursor-grabbing",
                    device.id === created && "bg-accent",
                  )}
                >
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {site ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Nouvel équipement
          </Button>
          <CreateDeviceDialog
            site={site}
            open={creating}
            onOpenChange={setCreating}
            onCreated={(deviceId) => {
              setQuery("");
              setCreated(deviceId);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
