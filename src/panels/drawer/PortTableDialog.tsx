import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
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
import { deviceMutationError } from "@/devices/mutationError";
import { matchesDeviceSearch } from "@/devices/search";
import { createStandaloneObjectId } from "@/lib/identity";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import type { PortKind } from "@/types/map";
import { api } from "../../../convex/_generated/api";

type PortTable = NonNullable<FunctionReturnType<typeof api.cables.portTable>>;
type PortRow = PortTable["ports"][number];
type PortEnd = NonNullable<PortRow["traceEnd"]>;
type InventoryRow = FunctionReturnType<typeof api.devices.listForSite>[number];

const KIND_LABELS: Record<PortKind, string | null> = {
  interface: null,
  front: "Avant",
  rear: "Arrière",
};

const byName = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

const isToastPress = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest("[data-sonner-toaster]") !== null;

const portLabel = (port: { name: string; kind: PortKind }) => {
  const kind = KIND_LABELS[port.kind];
  return kind ? `${kind} ${port.name}` : port.name;
};

/**
 * A device's ports with their cables, wherever in the site the other ends
 * stand, and where each trace ends. An Éditeur cables and unplugs from here.
 */
export function PortTableDialog({
  device,
  editable,
  open,
  onOpenChange,
}: {
  device: { id: string; name: string };
  /** Whether cables can be changed here: edit mode on the map, the role elsewhere. */
  editable: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Câbles de « {device.name} »</DialogTitle>
          <DialogDescription>
            Chaque port, ce qu'il relie et où mène le câble au-delà des panneaux
            de brassage.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted on open, so a half-chosen cable starts over. */}
        {open ? <PortTableBody device={device} editable={editable} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PortTableBody({
  device,
  editable,
}: {
  device: { id: string; name: string };
  editable: boolean;
}) {
  const deviceId = device.id;
  const table = useQuery(api.cables.portTable, { deviceId });
  const [cablingFrom, setCablingFrom] = useState<PortRow | null>(null);

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
        Cet équipement n'a aucun port.
      </p>
    );
  }
  if (cablingFrom) {
    return (
      <CablePicker
        siteId={table.siteId}
        from={{ deviceId, port: cablingFrom }}
        onDone={() => setCablingFrom(null)}
      />
    );
  }
  return (
    <ScrollArea className="max-h-[60vh]">
      <ul className="divide-y divide-border">
        {table.ports.map((port) => (
          <PortTableLine
            key={port.id}
            port={port}
            deviceName={device.name}
            editable={editable}
            onCable={() => setCablingFrom(port)}
          />
        ))}
      </ul>
    </ScrollArea>
  );
}

function PortTableLine({
  port,
  deviceName,
  editable,
  onCable,
}: {
  port: PortRow;
  deviceName: string;
  editable: boolean;
  onCable: () => void;
}) {
  const connect = useMutation(api.cables.connect);
  const disconnect = useMutation(api.cables.disconnect);
  const { cable } = port;

  const unplug = async (cableId: string) => {
    try {
      const removed = await disconnect({ cableId });
      if (!removed) return;
      // The same id and ends bring the cable back as it was.
      const restore = async () => {
        try {
          await connect(removed);
        } catch (error) {
          toast.error(deviceMutationError(error));
        }
      };
      toast(`« ${deviceName} » ${portLabel(port)} débranché`, {
        action: { label: "Annuler", onClick: () => void restore() },
        duration: 10_000,
      });
    } catch (error) {
      toast.error(deviceMutationError(error));
    }
  };

  return (
    <li className="flex items-center gap-3 py-2 pr-3">
      <span className="w-24 shrink-0 font-mono text-sm">{portLabel(port)}</span>
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
          <span className="text-muted-foreground">Libre</span>
        )}
      </div>
      {editable && !cable ? (
        <Button variant="outline" size="sm" onClick={onCable}>
          Câbler
        </Button>
      ) : null}
      {editable && cable && !cable.source ? (
        <Button variant="ghost" size="sm" onClick={() => void unplug(cable.id)}>
          Débrancher
        </Button>
      ) : null}
    </li>
  );
}

function PortEndLabel({ end }: { end: PortEnd }) {
  return (
    <span>
      <span className="font-medium text-foreground">{end.deviceName}</span>
      {" · "}
      <span className="font-mono">
        {portLabel({ name: end.portName, kind: end.portKind })}
      </span>
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
  from: { deviceId: string; port: PortRow };
  onDone: () => void;
}) {
  const [target, setTarget] = useState<InventoryRow | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          Câbler <span className="font-mono">{portLabel(from.port)}</span>
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
      (device) => device.id !== excluded && matchesDeviceSearch(device, query),
    )
    .sort((a, b) => byName.compare(a.name, b.name));
  return (
    <Command shouldFilter={false} className="rounded-lg! border">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Équipement : nom, hostname, MAC, IP…"
      />
      <CommandList>
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
  from: { deviceId: string; port: PortRow };
  target: InventoryRow;
  onDone: () => void;
}) {
  const table = useQuery(api.cables.portTable, { deviceId: target.id });
  const connect = useMutation(api.cables.connect);
  const [error, setError] = useState<string | null>(null);
  const free = table?.ports.filter((port) => !port.cable);

  const cable = async (port: PortRow) => {
    try {
      await connect({
        id: createStandaloneObjectId("cable"),
        a: { deviceId: from.deviceId, portId: from.port.id },
        b: { deviceId: target.id, portId: port.id },
      });
      onDone();
    } catch (caught) {
      setError(deviceMutationError(caught));
    }
  };

  return (
    <Command className="rounded-lg! border">
      <CommandInput placeholder="Port libre…" />
      <CommandList>
        <CommandEmpty>
          {table === undefined
            ? "Chargement…"
            : "Aucun port libre sur cet équipement."}
        </CommandEmpty>
        {free?.map((port) => (
          <CommandItem
            key={port.id}
            value={portLabel(port)}
            onSelect={() => void cable(port)}
          >
            <span className="font-mono">{portLabel(port)}</span>
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
