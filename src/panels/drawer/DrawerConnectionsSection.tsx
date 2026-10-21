import { useState } from "react";
import type { Device, DeviceId } from "@/types/map";
import { StatusDot } from "@/components/StatusDot";
import type { DeviceConnection } from "@/devices/ports";
import { portLabel } from "@/devices/portState";

// A patch panel has a dozen cables; past this many they fold away.
const SHOWN = 6;

// A far port is worth naming only where a device has many.
const MANY_PORTS = new Set<Device["type"]>(["switch", "patch-panel"]);

interface DrawerConnectionsSectionProps {
  /** The device's cables, in the order of its own ports. */
  connections: ReadonlyArray<DeviceConnection>;
  /** The floor's devices: a far end on another floor is not among them. */
  deviceById: ReadonlyMap<DeviceId, Device>;
  onSelectConnected: (deviceId: DeviceId) => void;
}

/** One compact line per cable: « Avant 1 → Prise B-01 », sorted by port. */
export function DrawerConnectionsSection({
  connections,
  deviceById,
  onSelectConnected,
}: DrawerConnectionsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  if (connections.length === 0) return null;
  const shown = expanded ? connections : connections.slice(0, SHOWN);

  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Connexions ({connections.length})
      </h3>
      <ul className="-mx-2">
        {shown.map(({ cableId, port, far, farPort }) => {
          const other = deviceById.get(far.deviceId);
          return (
            <li key={cableId}>
              {other ? (
                <button
                  type="button"
                  onClick={() => onSelectConnected(other.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm outline-hidden hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {portLabel(port)}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={other.name}>
                    {other.name}
                    {farPort && MANY_PORTS.has(other.type) ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {" "}
                        {portLabel(farPort)}
                      </span>
                    ) : null}
                  </span>
                  <StatusDot
                    status={other.metadata.status ?? "unknown"}
                    className="shrink-0"
                  />
                </button>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                  <span className="shrink-0 font-mono text-xs">
                    {portLabel(port)}
                  </span>
                  <span aria-hidden>→</span>
                  <span className="truncate">un autre étage</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {connections.length > SHOWN ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {expanded ? "Voir moins" : `Voir tout (${connections.length})`}
        </button>
      ) : null}
    </section>
  );
}
