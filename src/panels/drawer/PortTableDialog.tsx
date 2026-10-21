import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { matchesDeviceSearch } from "@/devices/search";
import { createStandaloneObjectId } from "@/lib/identity";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import type { IntegrationKind } from "@/sites/integrations";
import { endLabel, portLabel, shortPortName } from "@/devices/portState";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { DeviceType } from "@/types/map";
import { useCableCommands } from "@/devices/useCableCommands";
import { api } from "../../../convex/_generated/api";

type PortTable = NonNullable<FunctionReturnType<typeof api.cables.portTable>>;
type PortRow = PortTable["ports"][number];
type PortEnd = NonNullable<PortRow["traceEnd"]>;
type InventoryRow = FunctionReturnType<typeof api.devices.listForSite>[number];
type CableFrom = {
  deviceId: string;
  deviceName: string;
  deviceType: DeviceType;
  port: PortRow;
};

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const isToastPress = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest("[data-sonner-toaster]") !== null;

/**
 * A device's ports with their cables, wherever in the site the other ends
 * stand, and where each trace ends. An Éditeur cables and unplugs from here.
 */
export function PortTableDialog({
  device,
  editable,
  open,
  onOpenChange,
  focusPortId,
}: {
  device: { id: string; name: string };
  /** Whether cables can be changed here: edit mode on the map, the role elsewhere. */
  editable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The port the table opens on, scrolled to and highlighted. */
  focusPortId?: string | null;
}) {
  return (
    <Dialog
      open={open}
      // A fully modal dialog blocks presses outside it, the "Annuler" of a
      // toast included; focus stays trapped, and a press on a toast does not
      // close the dialog.
      modal="trap-focus"
      onOpenChange={(next, details) => {
        if (!next && isToastPress(details.event)) return;
        onOpenChange(next);
      }}
    >
      {/* Anchored at the top, so the dialog does not jump as its body changes. */}
      <DialogContent className="top-[8vh] max-h-[84vh] translate-y-0 grid-rows-[auto_minmax(0,1fr)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Câbles de « {device.name} »</DialogTitle>
          <DialogDescription>
            Chaque port, ce qu'il relie et où mène le câble au-delà des panneaux
            de brassage.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted on open, so a half-chosen cable starts over. */}
        {open ? (
          <PortTableBody
            device={device}
            editable={editable}
            focusPortId={focusPortId ?? null}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Why a device shows no port. One its source brings without a physical port
 * is out of the ordinary (a core switch whose interfaces NetBox only models
 * as virtual ones), and the message says so; a rack has none by nature.
 */
const noPortMessage = (
  type: DeviceType,
  source: IntegrationKind | undefined,
): string => {
  if (!source || type === "rack") return "Cet équipement n'a aucun port.";
  return `${INTEGRATION_LABELS[source]} ne décrit aucun port physique pour cet équipement, ce qui est inhabituel.`;
};

type PortFilter = "all" | "cabled" | "free";

const FILTER_LABELS: Record<PortFilter, string> = {
  all: "Tous",
  cabled: "Câblés",
  free: "Libres",
};

// Past this many ports, a search and a filter earn their place.
const SEARCHABLE_FROM = 12;

const timeOf = (at: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    hourCycle: "h23",
    ...(new Date(at).toDateString() === new Date().toDateString()
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  }).format(at);

function PortTableBody({
  device,
  editable,
  focusPortId,
}: {
  device: { id: string; name: string };
  editable: boolean;
  focusPortId: string | null;
}) {
  const deviceId = device.id;
  const table = useQuery(api.cables.portTable, { deviceId });
  const [cablingFrom, setCablingFrom] = useState<PortRow | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PortFilter>("all");

  if (table === undefined) {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (table === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Cet équipement n'existe plus.
      </p>
    );
  }
  if (table.ports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {noPortMessage(table.deviceType, table.source)}
      </p>
    );
  }
  if (cablingFrom) {
    return (
      <CablePicker
        siteId={table.siteId}
        from={{
          deviceId,
          deviceName: device.name,
          deviceType: table.deviceType,
          port: cablingFrom,
        }}
        onDone={() => setCablingFrom(null)}
      />
    );
  }

  const counts: Record<PortFilter, number> = {
    all: table.ports.length,
    cabled: table.ports.filter((port) => port.cable).length,
    free: table.ports.filter((port) => !port.cable).length,
  };
  const needle = query.trim().toLowerCase();
  const shown = table.ports.filter(
    (port) =>
      (filter === "all" || (filter === "cabled") === Boolean(port.cable)) &&
      (needle === "" ||
        port.name.toLowerCase().includes(needle) ||
        shortPortName(port.name).toLowerCase().includes(needle)),
  );
  const withObserved = table.ports.some((port) => port.observed.length > 0);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {table.lastSeen ? (
        <p className="text-sm text-muted-foreground">
          Vu sur le réseau : <LastSeen lastSeen={table.lastSeen} />
        </p>
      ) : null}
      {table.ports.length > SEARCHABLE_FROM ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Port…"
            aria-label="Chercher un port"
            className="h-8 w-40"
          />
          <div className="flex gap-1" role="group" aria-label="Ports">
            {(Object.keys(FILTER_LABELS) as Array<PortFilter>).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? "secondary" : "ghost"}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {FILTER_LABELS[value]}
                <span className="text-muted-foreground tabular-nums">
                  {counts[value]}
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <ScrollArea className="min-h-0">
        {shown.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Aucun port ne correspond.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((port) => (
              <PortTableLine
                key={port.id}
                port={port}
                deviceName={device.name}
                deviceType={table.deviceType}
                editable={editable}
                withObserved={withObserved}
                focused={port.id === focusPortId}
                onCable={() => setCablingFrom(port)}
              />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function LastSeen({
  lastSeen,
}: {
  lastSeen: NonNullable<PortTable["lastSeen"]>;
}) {
  const { place, at } = lastSeen;
  return (
    <>
      <span className="text-foreground">{place.switchName}</span>{" "}
      <span className="font-mono" title={place.portName}>
        {shortPortName(place.portName)}
      </span>
      {place.socketName ? <> · {place.socketName}</> : null} · {timeOf(at)}
    </>
  );
}

function PortTableLine({
  port,
  deviceName,
  deviceType,
  editable,
  withObserved,
  focused,
  onCable,
}: {
  port: PortRow;
  deviceName: string;
  deviceType: DeviceType;
  editable: boolean;
  withObserved: boolean;
  focused: boolean;
  onCable: () => void;
}) {
  const { unplug } = useCableCommands();
  const { cable } = port;
  const label = portLabel(port, deviceType);

  return (
    <li
      ref={
        focused ? (row) => row?.scrollIntoView({ block: "center" }) : undefined
      }
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 py-2 pr-3",
        focused && "-mx-2 rounded-md bg-muted px-2",
      )}
    >
      <span
        className="min-w-16 shrink-0 font-mono text-sm"
        title={label === port.name ? port.name : `${label} (${port.name})`}
      >
        {deviceType === "patch-panel" ? label : shortPortName(port.name)}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        {cable ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <PortEndLabel end={cable.far} />
              {cable.source ? (
                <Badge variant="outline">
                  {INTEGRATION_LABELS[cable.source.integration]}
                </Badge>
              ) : null}
            </div>
            {port.traceEnd ? (
              <div className="text-xs text-muted-foreground">
                jusqu'à <PortEndLabel end={port.traceEnd} />
              </div>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">Pas de câble documenté</span>
        )}
      </div>
      {withObserved ? (
        // Its own column where there is room, under the line otherwise.
        <div className="order-last basis-full pl-[calc(4rem+0.75rem)] text-xs sm:order-none sm:w-36 sm:shrink-0 sm:basis-auto sm:pl-0">
          {port.observed.map((seen) => (
            <div
              key={`${seen.name}-${seen.at}`}
              className={cn(
                "truncate",
                seen.current ? "text-foreground" : "text-muted-foreground",
              )}
              title={`Vu ${seen.current ? "à la dernière lecture" : "pour la dernière fois"} à ${timeOf(seen.at)}`}
            >
              {seen.name} · {timeOf(seen.at)}
            </div>
          ))}
        </div>
      ) : null}
      {editable && !cable ? (
        <Button variant="outline" size="sm" onClick={onCable}>
          Câbler
        </Button>
      ) : null}
      {editable && cable && !cable.source ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void unplug(cable.id, endLabel(deviceName, port, deviceType))
          }
        >
          Débrancher
        </Button>
      ) : null}
    </li>
  );
}

// A socket or a PC has one port: its name says nothing more than the device's.
const NAMES_ITS_PORTS = new Set<DeviceType>(["switch", "patch-panel"]);

function PortEndLabel({ end }: { end: PortEnd }) {
  return (
    <span>
      <span className="font-medium text-foreground">{end.deviceName}</span>
      {NAMES_ITS_PORTS.has(end.deviceType) ? (
        <>
          {" · "}
          <span className="font-mono" title={end.portName}>
            {end.deviceType === "patch-panel"
              ? portLabel(
                  { name: end.portName, kind: end.portKind },
                  end.deviceType,
                )
              : shortPortName(end.portName)}
          </span>
        </>
      ) : null}
      <span className="text-muted-foreground">
        {" "}
        ({end.place ?? "hors plan"})
      </span>
    </span>
  );
}

/** Picks a device of the site, then one of its free ports, and cables it. */
function CablePicker({
  siteId,
  from,
  onDone,
}: {
  siteId: string;
  from: CableFrom;
  onDone: () => void;
}) {
  const [target, setTarget] = useState<InventoryRow | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          Câbler{" "}
          <span className="font-mono">
            {portLabel(from.port, from.deviceType)}
          </span>
          {target ? (
            <>
              {" "}
              à <span className="font-medium">{target.name}</span>
            </>
          ) : null}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (target ? setTarget(null) : onDone())}
        >
          Retour
        </Button>
      </div>
      {target ? (
        <FreePortList from={from} target={target} onDone={onDone} />
      ) : (
        <DeviceList
          siteId={siteId}
          excluded={from.deviceId}
          onSelect={setTarget}
        />
      )}
    </div>
  );
}

function DeviceList({
  siteId,
  excluded,
  onSelect,
}: {
  siteId: string;
  excluded: string;
  onSelect: (device: InventoryRow) => void;
}) {
  const devices = useQuery(api.devices.listForSite, { siteId });
  const [query, setQuery] = useState("");
  const shown = devices
    ?.filter(
      (device) =>
        // A rack has no port to cable.
        device.type !== "rack" &&
        device.id !== excluded &&
        matchesDeviceSearch(device, query),
    )
    .sort((a, b) => byName.compare(a.name, b.name));
  return (
    <Command shouldFilter={false} className="rounded-lg! border">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Équipement : nom, hostname, MAC, IP…"
        autoFocus
      />
      <CommandList className="max-h-[50vh]">
        <CommandEmpty>
          {devices === undefined
            ? "Chargement…"
            : "Aucun équipement ne correspond."}
        </CommandEmpty>
        {shown?.map((device) => (
          <CommandItem
            key={device.id}
            value={device.id}
            onSelect={() => onSelect(device)}
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate">{device.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  getDeviceKindLabel(device.type),
                  device.location
                    ? `${device.location.buildingName} · ${device.location.floorName}`
                    : "Hors plan",
                ].join(" · ")}
              </span>
            </div>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

function FreePortList({
  from,
  target,
  onDone,
}: {
  from: CableFrom;
  target: InventoryRow;
  onDone: () => void;
}) {
  const table = useQuery(api.cables.portTable, { deviceId: target.id });
  const { plug } = useCableCommands();
  const [error, setError] = useState<string | null>(null);
  const free = table?.ports.filter((port) => !port.cable);

  const cable = async (port: PortRow) => {
    const refusal = await plug(
      {
        id: createStandaloneObjectId("cable"),
        a: { deviceId: from.deviceId, portId: from.port.id },
        b: { deviceId: target.id, portId: port.id },
      },
      `${endLabel(from.deviceName, from.port, from.deviceType)} ↔ ${endLabel(target.name, port, target.type)}`,
    );
    if (refusal) setError(refusal);
    else onDone();
  };

  return (
    <Command className="rounded-lg! border">
      <CommandInput placeholder="Port libre…" autoFocus />
      <CommandList className="max-h-[50vh]">
        <CommandEmpty>
          {table === undefined
            ? "Chargement…"
            : "Aucun port libre sur cet équipement."}
        </CommandEmpty>
        {free?.map((port) => (
          <CommandItem
            key={port.id}
            value={`${portLabel(port, target.type)} ${shortPortName(port.name)}`}
            onSelect={() => void cable(port)}
          >
            <span className="font-mono">
              {target.type === "patch-panel"
                ? portLabel(port, target.type)
                : shortPortName(port.name)}
            </span>
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
