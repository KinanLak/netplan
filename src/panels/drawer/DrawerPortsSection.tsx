import type { Device } from "@/types/map";
import { cn } from "@/lib/utils";

interface DrawerPortsSectionProps {
  ports: NonNullable<Device["metadata"]["ports"]>;
}

export function DrawerPortsSection({ ports }: DrawerPortsSectionProps) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Ports ({ports.length})
      </h3>
      <div className="grid grid-cols-12 gap-1">
        {ports.map((port) => (
          <div
            key={port.id}
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-sm text-[8px]",
              port.status === "up" && "bg-up text-primary-foreground",
              port.status === "down" && "bg-down text-primary-foreground",
              port.status === "unknown" && "bg-unknown text-primary-foreground",
            )}
            title={`Port ${port.number}: ${port.status}`}
          >
            {port.number}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-up" />
          {ports.filter((p) => p.status === "up").length} actifs
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-down" />
          {ports.filter((p) => p.status === "down").length} down
        </span>
      </div>
    </section>
  );
}
