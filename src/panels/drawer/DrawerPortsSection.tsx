import type { Port } from "@/types/map";
import { Button } from "@/components/ui/button";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import {
  PORT_STATE_CLASSES,
  PORT_STATE_LABELS,
  portState,
  shownPorts,
} from "@/devices/portState";
import type { PortState } from "@/devices/portState";
import { cn } from "@/lib/utils";

interface DrawerPortsSectionProps {
  /** The device's ports in display order. */
  ports: ReadonlyArray<Port>;
  onShowCables: () => void;
}

const LEGEND: ReadonlyArray<PortState> = ["seen", "up", "down"];

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
  onShowCables,
}: DrawerPortsSectionProps) {
  const shown = shownPorts(ports);
  if (shown.length === 0) return null;
  const count = (state: PortState) =>
    shown.filter((port) => portState(port) === state).length;
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
          onClick={onShowCables}
          className="h-6 gap-1 text-xs"
        >
          Câbles
          <ShortcutHintInline action="show-port-cables" />
        </Button>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {shown.map((port) => (
          <div
            key={port.id}
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-sm text-[8px]",
              PORT_STATE_CLASSES[portState(port)],
              ON_STATE[portState(port)],
            )}
            title={`${port.name} : ${PORT_STATE_LABELS[portState(port)]}`}
          >
            {port.order}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {LEGEND.map((state) => (
          <span key={state} className="flex items-center gap-1">
            <span
              className={cn("h-2 w-2 rounded-sm", PORT_STATE_CLASSES[state])}
            />
            {PORT_STATE_LABELS[state]} : {count(state)}
          </span>
        ))}
      </div>
    </section>
  );
}
