import type { FunctionReturnType } from "convex/server";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Location01Icon,
  PlugSocketIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AbsenceNote,
  DeviceIdentitySections,
  LastSeenSection,
  StatusChip,
} from "@/panels/drawer/DeviceDetails";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import type { api } from "../../convex/_generated/api";

type InventoryRow = FunctionReturnType<typeof api.devices.listForSite>[number];

/**
 * Any device of the site, placed or not, read-only: what the map's drawer
 * shows of its identity, for the devices the map does not show (A96).
 */
export function DeviceSheet({
  device,
  onOpenChange,
  onShowCables,
  onShowHistory,
  onShowOnMap,
}: {
  device: InventoryRow | null;
  onOpenChange: (open: boolean) => void;
  onShowCables: () => void;
  /** Absent for a Lecteur, or a device without history. */
  onShowHistory?: () => void;
  /** Absent for a device on no floor. */
  onShowOnMap?: () => void;
}) {
  return (
    <Sheet open={device !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-80 gap-0 p-0 sm:max-w-80">
        {device ? (
          <>
            <SheetHeader className="gap-3 border-b px-4 py-4">
              <div className="min-w-0 pr-8">
                <SheetTitle className="truncate text-lg" title={device.name}>
                  {device.name}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap gap-x-2">
                  <span>{getDeviceKindLabel(device.type)}</span>
                  {device.source ? (
                    <span>{INTEGRATION_LABELS[device.source.integration]}</span>
                  ) : null}
                </SheetDescription>
                <AbsenceNote source={device.source} />
              </div>
              <StatusChip
                status={device.metadata.status ?? "unknown"}
                lastSeenAt={device.metadata.lastSeenAt}
              />
              <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                {device.location ? (
                  <>
                    <span>{device.location.buildingName}</span>
                    <span>{device.location.floorName}</span>
                  </>
                ) : (
                  "Hors plan"
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {/* A rack has no port to cable. */}
                {device.type === "rack" ? null : (
                  <Button variant="outline" size="sm" onClick={onShowCables}>
                    <HugeiconsIcon icon={PlugSocketIcon} strokeWidth={1.5} />
                    Ports et câbles
                  </Button>
                )}
                {onShowHistory ? (
                  <Button variant="outline" size="sm" onClick={onShowHistory}>
                    <HugeiconsIcon icon={WorkHistoryIcon} strokeWidth={1.5} />
                    Historique
                  </Button>
                ) : null}
                {onShowOnMap ? (
                  <Button variant="outline" size="sm" onClick={onShowOnMap}>
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={1.5} />
                    Voir sur le plan
                  </Button>
                ) : null}
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <DeviceIdentitySections device={device} />
              <LastSeenSection deviceId={device.id} />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
