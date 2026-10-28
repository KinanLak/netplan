import type { DeviceType, Port, PortId } from "@/types/map";
import { Button } from "@/components/ui/button";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  PORT_STATE_CLASSES,
  PORT_STATE_LABELS,
  portLabel,
  portState,
  shortPortName,
  shownPorts,
} from "@/devices/portState";
import type { PortState } from "@/devices/portState";
import { cn } from "@/lib/utils";

interface DrawerPortsSectionProps {
  /** The device's ports in display order. */
  ports: ReadonlyArray<Port>;
  deviceType: DeviceType;
  /** Where each cabled port leads, as far as the floor knows. */
  farEnds: ReadonlyMap<PortId, string>;
  /** Opens the port table, on a port when one is given. */
  onShowCables: (portId?: PortId) => void;
}

// The port number reads on the filled colours, and in the status colour on
// the outlined ones.
const ON_STATE: Record<PortState, string> = {
  seen: "text-primary-foreground",
  up: "text-up",
  down: "text-muted-foreground",
  unknown: "text-primary-foreground",
};

export function DrawerPortsSection({
  ports,
  deviceType,
  farEnds,
  onShowCables,
}: DrawerPortsSectionProps) {
  const shown = shownPorts(ports);
  if (shown.length === 0) return null;
  const states = shown.map(portState);
  const nameOf = (port: Port) =>
    deviceType === "patch-panel"
      ? portLabel(port, deviceType)
      : shortPortName(port.name);
  const describe = (port: Port) => {
    const far = farEnds.get(port.id);
    return `${nameOf(port)} · ${PORT_STATE_LABELS[portState(port)]}${far ? ` → ${far}` : ""}`;
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Ports ({shown.length})
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onShowCables()}
          className="h-6 gap-1 text-xs"
        >
          Ports et câbles…
          <ShortcutHintInline action="show-port-cables" />
        </Button>
      </div>
      {shown.length === 1 && shown[0] ? (
        // One port says more as a line than as a lone square.
        <button
          type="button"
          onClick={() => onShowCables(shown[0]?.id)}
          className="flex w-full items-center gap-2 rounded-md text-left text-sm outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              "size-2.5 shrink-0 rounded-sm",
              PORT_STATE_CLASSES[portState(shown[0])],
            )}
          />
          <span className="truncate">{describe(shown[0])}</span>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-12 gap-1">
            {shown.map((port) => (
              <Tooltip key={port.id}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => onShowCables(port.id)}
                      aria-label={describe(port)}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-sm text-[9px] outline-hidden hover:ring-2 hover:ring-ring/60 focus-visible:ring-2 focus-visible:ring-ring",
                        PORT_STATE_CLASSES[portState(port)],
                        ON_STATE[portState(port)],
                      )}
                    />
                  }
                >
                  {port.order}
                </TooltipTrigger>
                <TooltipContent side="top">{describe(port)}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          <ActiveLinks states={states} />
        </>
      )}
    </section>
  );
}

/**
 * How many links are up, and nothing else: the grid's colours say the rest
 * (owner, 2026-10-28). A port with a device seen on it is up too. A device
 * whose ports nobody observes, such as a patch panel, gets no line.
 */
function ActiveLinks({ states }: { states: ReadonlyArray<PortState> }) {
  if (states.every((state) => state === "unknown")) return null;
  const active = states.filter(
    (state) => state === "seen" || state === "up",
  ).length;
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {active === 0
        ? "Aucun lien actif"
        : `${active} ${active === 1 ? "lien actif" : "liens actifs"}`}
    </p>
  );
}
