import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { Time } from "@/components/time";
import { UnderlineTabs } from "@/components/underline-tabs";
import { snapshotRuns } from "@/history/snapshotRuns";
import { timeline } from "@/history/timeline";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EventSummary, LoadMore, PlaceLabel } from "@/history/HistoryLists";
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
  open,
  onOpenChange,
}: {
  device: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Anchored at the top: switching views changes the height, and a
          centred dialog would jump. */}
      <DialogContent className="top-[8vh] translate-y-0 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historique de « {device.name} »</DialogTitle>
        </DialogHeader>
        {open ? <DeviceHistoryBody deviceId={device.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function DeviceHistoryBody({ deviceId }: { deviceId: string }) {
  const [view, setView] = useState<View>("events");
  return (
    <div className="space-y-3">
      <UnderlineTabs
        label="Vue"
        idPrefix={`device-history-${deviceId}`}
        value={view}
        onChange={setView}
        tabs={[
          { value: "events", label: "Événements" },
          { value: "snapshots", label: "Relevés" },
        ]}
      />
      {view === "events" ? (
        <DeviceEvents deviceId={deviceId} />
      ) : (
        <DeviceSnapshots deviceId={deviceId} />
      )}
    </div>
  );
}

function DeviceEvents({ deviceId }: { deviceId: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.forDevice,
    { deviceId },
    { initialNumItems: 30 },
  );
  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  if (results.length === 0) return null;
  return (
    <ScrollArea className="*:data-[slot=scroll-area-viewport]:max-h-[60vh]">
      <ul className="divide-y divide-border">
        {timeline(results)
          .flatMap((day) => day.rows)
          .map(({ event, cameOnline }) => (
            <li
              key={`${event.at}-${event.kind}`}
              className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm"
            >
              <span className="text-muted-foreground tabular-nums">
                <Time at={event.at} />
              </span>
              <EventSummary event={event} cameOnline={cameOnline} />
            </li>
          ))}
      </ul>
      <LoadMore status={status} onLoadMore={() => loadMore(30)} />
    </ScrollArea>
  );
}

function DeviceSnapshots({ deviceId }: { deviceId: string }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.history.snapshotsForDevice,
    { deviceId },
    { initialNumItems: 30 },
  );
  if (status === "LoadingFirstPage") {
    return <p className="text-sm text-muted-foreground">Chargement…</p>;
  }
  // A page can come back empty while older ones remain: it held only
  // entries of captures that failed.
  if (results.length === 0 && status === "Exhausted") return null;
  const manyMacs = new Set(results.map(({ mac }) => mac)).size > 1;
  return (
    <ScrollArea className="*:data-[slot=scroll-area-viewport]:max-h-[60vh]">
      <ul className="divide-y divide-border">
        {snapshotRuns(results).map(({ newest, oldestAt, count }) => (
          <li
            key={`${newest.slotAt}-${newest.mac}`}
            className="grid grid-cols-[11rem_1fr] gap-3 py-2 text-sm"
          >
            <span className="flex flex-col text-muted-foreground tabular-nums">
              {count === 1 ? (
                <Time at={newest.slotAt} />
              ) : (
                <>
                  <Time at={oldestAt} />
                  <Time at={newest.slotAt} />
                  <span className="text-xs">{count} relevés</span>
                </>
              )}
            </span>
            <span className="flex min-w-0 flex-col">
              <PlaceLabel place={newest.place} />
              {/* Two places at one time are two MACs, not a contradiction. */}
              {manyMacs ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {newest.mac}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <LoadMore status={status} onLoadMore={() => loadMore(30)} />
    </ScrollArea>
  );
}
