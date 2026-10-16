import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  EventSummary,
  LoadMore,
  PlaceLabel,
  formatHistoryTime,
} from "@/history/HistoryLists";
import type { DeviceType } from "@/types/map";
import { api } from "../../convex/_generated/api";

/**
 * The device types the network vouches for, the only ones with a history:
 * `PRESENT_TYPES` on the server.
 */
export const HAS_HISTORY: ReadonlySet<DeviceType> = new Set(["pc", "endpoint"]);

type View = "events" | "snapshots";

/**
 * Thirty days of where the network saw a device and when it was on, and
 * where it stood at each daily snapshot (ADR 0027). Éditeur and Admin only.
 */
export function DeviceHistoryDialog({
  device,
  timezone,
  open,
  onOpenChange,
}: {
  device: { id: string; name: string };
  timezone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historique de « {device.name} »</DialogTitle>
          <DialogDescription>
            Ce que le réseau a observé ces 30 derniers jours.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <DeviceHistoryBody deviceId={device.id} timezone={timezone} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DeviceHistoryBody({
  deviceId,
  timezone,
}: {
  deviceId: string;
  timezone: string;
}) {
  const [view, setView] = useState<View>("events");
  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Vue"
        className="flex w-fit gap-1 rounded-lg border p-1"
      >
        <Button
          size="sm"
          variant={view === "events" ? "secondary" : "ghost"}
          aria-pressed={view === "events"}
          onClick={() => setView("events")}
        >
          Événements
        </Button>
        <Button
          size="sm"
          variant={view === "snapshots" ? "secondary" : "ghost"}
          aria-pressed={view === "snapshots"}
          onClick={() => setView("snapshots")}
        >
          Relevés
        </Button>
      </div>
      {view === "events" ? (
        <DeviceEvents deviceId={deviceId} timezone={timezone} />
      ) : (
        <DeviceSnapshots deviceId={deviceId} timezone={timezone} />
      )}
    </div>
  );
}

function DeviceEvents({
  deviceId,
  timezone,
}: {
  deviceId: string;
  timezone: string;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.forDevice,
    { deviceId },
    { initialNumItems: 30 },
  );
  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Le réseau n'a rien observé de cet équipement ces 30 derniers jours.
      </p>
    );
  }
  return (
    <ScrollArea className="max-h-[60vh]">
      <ul className="divide-y divide-border">
        {results.map((event) => (
          <li
            key={`${event.at}-${event.kind}`}
            className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm"
          >
            <span className="text-muted-foreground tabular-nums">
              {formatHistoryTime(event.at, timezone)}
            </span>
            <EventSummary event={event} timezone={timezone} />
          </li>
        ))}
      </ul>
      <LoadMore status={status} onLoadMore={() => loadMore(30)} />
    </ScrollArea>
  );
}

function DeviceSnapshots({
  deviceId,
  timezone,
}: {
  deviceId: string;
  timezone: string;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.snapshotsForDevice,
    { deviceId },
    { initialNumItems: 30 },
  );
  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun relevé de 8 h, 12 h, 14 h, 16 h ou 19 h n'a vu cet équipement ces
        30 derniers jours.
      </p>
    );
  }
  return (
    <ScrollArea className="max-h-[60vh]">
      <ul className="divide-y divide-border">
        {results.map((entry) => (
          <li
            key={`${entry.slotAt}-${entry.mac}`}
            className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm"
          >
            <span className="text-muted-foreground tabular-nums">
              {formatHistoryTime(entry.slotAt, timezone)}
            </span>
            <PlaceLabel place={entry.place} />
          </li>
        ))}
      </ul>
      <LoadMore status={status} onLoadMore={() => loadMore(30)} />
    </ScrollArea>
  );
}
