import type { Port } from "@/types/map";
import { DEVICE_STATUS_LABELS } from "@/devices/status";
import { cn } from "@/lib/utils";

interface DrawerPortsSectionProps {
  /** The device's ports in display order. */
  ports: ReadonlyArray<Port>;
}

/** A patch panel's rear ports mirror its front ones, so only those show. */
export function DrawerPortsSection({ ports }: DrawerPortsSectionProps) {
  const shown = ports.filter((port) => port.kind !== "rear");
  if (shown.length === 0) return null;
  const count = (status: Port["status"]) =>
    shown.filter((port) => port.status === status).length;
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Ports ({shown.length})
      </h3>
      <div className="grid grid-cols-12 gap-1">
        {shown.map((port) => (
          <div
            key={port.id}
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-sm text-[8px]",
              port.status === "up" && "bg-up text-primary-foreground",
              port.status === "down" && "bg-down text-primary-foreground",
              (port.status ?? "unknown") === "unknown" &&
                "bg-unknown text-primary-foreground",
            )}
            title={`${port.name} : ${DEVICE_STATUS_LABELS[port.status ?? "unknown"]}`}
          >
            {port.order}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-up" />
          {count("up")} actifs
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-down" />
          {count("down")} down
        </span>
      </div>
    </section>
  );
}
