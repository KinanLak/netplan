import { useId, useState } from "react";
import type { DragEvent, KeyboardEvent } from "react";
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
  const listId = useId();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // The row the search field's arrows move and Enter places; a new device
  // starts there, and so does the device the inventory sent here (B23).
  const placeTargetId = useMapStore((s) => s.placeTargetId);
  const [activeId, setActiveId] = useState<string | null>(placeTargetId);
  // The panel may already be open when the inventory sends another device:
  // the new target takes over, and a search that would hide it is cleared.
  const [appliedTargetId, setAppliedTargetId] = useState(placeTargetId);
  if (placeTargetId !== appliedTargetId) {
    setAppliedTargetId(placeTargetId);
    if (placeTargetId !== null) {
      setActiveId(placeTargetId);
      setQuery("");
    }
  }

  const unplaced = devices
    ?.filter((device) => !device.location)
    .sort((a, b) => byName.compare(a.name, b.name));
  const shown = unplaced?.filter((device) =>
    matchesDeviceSearch(device, query),
  );

  const place = (row: InventoryRow) => {
    setError(placeAtCentre(row.id));
  };

  const active =
    shown?.find((device) => device.id === activeId) ?? shown?.at(0) ?? null;
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setPlacePanelOpen(false);
      return;
    }
    if (!shown || shown.length === 0) return;
    const index = active ? shown.indexOf(active) : -1;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveId(shown[(index + step + shown.length) % shown.length].id);
    } else if (event.key === "Enter" && active) {
      event.preventDefault();
      place(active);
    }
  };

  const startDrag = (
    event: DragEvent<HTMLButtonElement>,
    row: InventoryRow,
  ) => {
    event.dataTransfer.setData(INVENTORY_DEVICE_MIME, row.id);
    event.dataTransfer.effectAllowed = "copy";
  };

  // Nothing left to place shows only the way out: creating a device (A15).
  const hasUnplaced = unplaced !== undefined && unplaced.length > 0;

  return (
    <div
      className="absolute top-4 right-4 z-20 flex max-h-[calc(100%-2rem)] w-72 flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg"
      aria-label="Placer un équipement"
      role="region"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Placer un équipement</h2>
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
      {devices === undefined ? (
        <p className="text-muted-foreground">Chargement…</p>
      ) : null}
      {hasUnplaced ? (
        <>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Nom, hostname, MAC, IP…"
            aria-label="Chercher dans l'inventaire"
            aria-controls={listId}
            aria-activedescendant={
              active ? `${listId}-${active.id}` : undefined
            }
            autoFocus
          />
          <ul
            id={listId}
            role="listbox"
            className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            {shown?.map((device) => (
              <li
                key={device.id}
                id={`${listId}-${device.id}`}
                role="option"
                aria-selected={device === active}
              >
                <button
                  type="button"
                  draggable={isReady}
                  disabled={!isReady}
                  onDragStart={(event) => startDrag(event, device)}
                  onClick={() => place(device)}
                  tabIndex={-1}
                  ref={(element) => {
                    if (element && device === active) {
                      element.scrollIntoView({ block: "nearest" });
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-grab flex-col rounded-md px-2 py-1.5 text-left hover:bg-accent active:cursor-grabbing",
                    device === active && "bg-accent",
                  )}
                >
                  <span className="truncate">{device.name}</span>
                  <span className="flex min-w-0 gap-x-2 text-xs text-muted-foreground">
                    {[
                      getDeviceKindLabel(device.type),
                      device.hostname,
                      device.macs[0],
                    ]
                      .filter(Boolean)
                      .map((part) => (
                        <span key={part} className="truncate">
                          {part}
                        </span>
                      ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {site ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
            Créer un équipement
          </Button>
          <CreateDeviceDialog
            site={site}
            open={creating}
            onOpenChange={setCreating}
            onCreated={(deviceId) => {
              setQuery("");
              setActiveId(deviceId);
            }}
          />
        </>
      ) : null}
    </div>
  );
}
