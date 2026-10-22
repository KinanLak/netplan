import { HugeiconsIcon } from "@hugeicons/react";
import { SocketName } from "@/devices/SocketName";
import {
  Location01Icon,
  WifiConnected01Icon,
  WifiDisconnected01Icon,
} from "@hugeicons/core-free-icons";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { api } from "../../convex/_generated/api";

export type HistoryEvent = FunctionReturnType<
  typeof api.history.forDevice
>["page"][number];
export type SnapshotEntry = FunctionReturnType<
  typeof api.history.snapshotsForDevice
>["page"][number];
type Place = SnapshotEntry["place"];

/** A date and time of the site's day, always with the day: history spans a month. */
export const formatHistoryTime = (at: number, timezone: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);

/** Where the network saw a device, with the names it had then. */
export function PlaceLabel({ place }: { place: Place }) {
  const floor = [place.buildingName, place.floorName]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">
        {place.socketName === undefined ? (
          "Sans prise"
        ) : (
          <SocketName name={place.socketName} />
        )}
        {floor ? (
          <span className="text-muted-foreground"> — {floor}</span>
        ) : null}
      </span>
      <span className="truncate font-mono text-xs text-muted-foreground">
        {place.switchName} · {place.portName}
      </span>
    </span>
  );
}

const EVENT_ICONS = {
  located: Location01Icon,
  online: WifiConnected01Icon,
  offline: WifiDisconnected01Icon,
};

export function EventSummary({
  event,
  timezone,
}: {
  event: HistoryEvent;
  timezone: string;
}) {
  return (
    <span className="flex items-start gap-2">
      <HugeiconsIcon
        icon={EVENT_ICONS[event.kind]}
        size={16}
        strokeWidth={1.5}
        className={cn(
          "mt-0.5 shrink-0",
          event.kind === "offline" ? "text-down" : "text-muted-foreground",
        )}
      />
      {event.kind === "located" && event.place ? (
        <PlaceLabel place={event.place} />
      ) : event.kind === "online" ? (
        <span>En ligne</span>
      ) : (
        <span className="flex flex-col">
          <span className="text-down">Hors ligne</span>
          {event.lastSeenAt === undefined ? null : (
            <span className="text-xs text-muted-foreground">
              Vu pour la dernière fois{" "}
              {formatHistoryTime(event.lastSeenAt, timezone)}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

/** The paginated query's "more" button, or why there is nothing more. */
export function LoadMore({
  status,
  onLoadMore,
}: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onLoadMore: () => void;
}) {
  if (status === "Exhausted" || status === "LoadingFirstPage") return null;
  return (
    <div className="flex justify-center pt-2">
      <Button
        variant="outline"
        size="sm"
        disabled={status === "LoadingMore"}
        onClick={onLoadMore}
      >
        {status === "LoadingMore" ? "Chargement…" : "Voir plus"}
      </Button>
    </div>
  );
}
