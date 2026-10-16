import type { DeviceId, DeviceStatus, DeviceType } from "@/types/map";
import { StatusDot } from "@/components/StatusDot";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";

export interface ConnectedDeviceSummary {
  id: DeviceId;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
}

interface DrawerConnectionsSectionProps {
  connectedDevices: Array<ConnectedDeviceSummary>;
  onSelectConnected: (deviceId: DeviceId) => void;
}

export function DrawerConnectionsSection({
  connectedDevices,
  onSelectConnected,
}: DrawerConnectionsSectionProps) {
  if (connectedDevices.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Connexions ({connectedDevices.length})
      </h3>
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
                  {getDeviceKindLabel(connDevice.type)}
                </div>
              </div>
              <StatusDot status={connDevice.status} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
