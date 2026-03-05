import type { Device } from "@/types/map";
import { Button } from "@/components/ui/button";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { StatusDot } from "@/components/StatusDot";

const typeLabels: Record<string, string> = {
  rack: "Rack Serveur",
  switch: "Switch Réseau",
  pc: "Poste de travail",
  "wall-port": "Prise murale",
};

interface DrawerConnectionsSectionProps {
  connectedDevices: Array<Device>;
  isCurrentDeviceHighlighted: boolean;
  onHighlightConnections: () => void;
  onSelectConnected: (deviceId: string) => void;
}

export function DrawerConnectionsSection({
  connectedDevices,
  isCurrentDeviceHighlighted,
  onHighlightConnections,
  onSelectConnected,
}: DrawerConnectionsSectionProps) {
  if (connectedDevices.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Connexions ({connectedDevices.length})
        </h3>
        <Button
          variant={isCurrentDeviceHighlighted ? "secondary" : "outline"}
          size="sm"
          onClick={onHighlightConnections}
          className="h-6 gap-1 text-xs"
        >
          {isCurrentDeviceHighlighted ? "Masquer" : "Voir sur plan"}
          <ShortcutHintInline action="highlight-connections" />
        </Button>
      </div>
      <div className="space-y-1">
        {connectedDevices.map((connDevice) => (
          <button
            type="button"
            key={connDevice.id}
            onClick={() => onSelectConnected(connDevice.id)}
            className="group w-full rounded-lg bg-muted px-3 py-2 text-left transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-foreground group-hover:text-primary">
                  {connDevice.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {typeLabels[connDevice.type] ?? connDevice.type}
                </div>
              </div>
              <StatusDot status={connDevice.metadata.status ?? "unknown"} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
