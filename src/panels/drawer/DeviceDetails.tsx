import { HugeiconsIcon } from "@hugeicons/react";
import { UserIcon } from "@hugeicons/core-free-icons";
import type { Device, DeviceStatus } from "@/types/map";
import { Badge } from "@/components/ui/badge";
import { CopyValue } from "@/components/copy-value";
import { StatusDot } from "@/components/StatusDot";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { DEVICE_STATUS_CLASSES, DEVICE_STATUS_LABELS } from "@/devices/status";
import { useQuery } from "convex/react";
import { cn } from "@/lib/utils";
import { Time } from "@/components/time";
import { meaningful } from "@/devices/placeholders";
import { useNow } from "@/hooks/use-now";
import { shortPortName } from "@/devices/portState";
import { api } from "../../../convex/_generated/api";
import { INTEGRATION_LABELS } from "@/sites/integrations";

// What the drawer on the map and the sheet of the inventory both show.

type DetailedDevice = Pick<
  Device,
  | "type"
  | "name"
  | "hostname"
  | "ip"
  | "macs"
  | "model"
  | "serial"
  | "notes"
  | "source"
  | "metadata"
>;

/** The device's name, kind and source, linked to the source when it can be. */
export function DeviceHeading({ device }: { device: DetailedDevice }) {
  return (
    <>
      <h2
        className="truncate text-lg font-semibold text-foreground"
        title={device.name}
      >
        {device.name}
      </h2>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {getDeviceKindLabel(device.type)}
        {device.source ? (
          <Badge
            variant="outline"
            render={
              device.source.url ? (
                <a
                  href={device.source.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`Ouvrir dans ${INTEGRATION_LABELS[device.source.integration]}`}
                />
              ) : undefined
            }
          >
            {INTEGRATION_LABELS[device.source.integration]}
          </Badge>
        ) : null}
      </p>
      <AbsenceNote source={device.source} />
    </>
  );
}

/** Since when the source no longer returns the device (ADR 0039). */
export function AbsenceNote({
  source,
  className = "text-sm",
}: {
  source: Device["source"];
  className?: string;
}) {
  if (source?.missingSince === undefined) return null;
  return (
    <p className={cn("text-muted-foreground", className)}>
      Absent de {INTEGRATION_LABELS[source.integration]} depuis le{" "}
      <Time at={source.missingSince} />
    </p>
  );
}

export function StatusChip({
  status,
  lastSeenAt,
}: {
  status: DeviceStatus;
  /** With `stale`: when the network last saw the device. */
  lastSeenAt?: number;
}) {
  const now = useNow(60_000);
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-2 rounded-full border py-1.5 pr-3 pl-2 text-sm font-medium",
        DEVICE_STATUS_CLASSES[status].badge,
      )}
    >
      <StatusDot status={status} className="size-4" />
      {DEVICE_STATUS_LABELS[status]}
      {status === "stale" && lastSeenAt !== undefined ? (
        <>
          {" depuis "}
          <Time at={lastSeenAt} format="when" now={now} />
        </>
      ) : null}
    </span>
  );
}

/**
 * Where and when the network last saw the device, for every role (C7): the
 * answer to « where was it on Monday morning? », not its history.
 */
export function LastSeenSection({ deviceId }: { deviceId: string }) {
  const lastSeen = useQuery(api.devices.lastSeen, { deviceId });
  const now = useNow(60_000);
  if (!lastSeen) return null;
  const { place, at } = lastSeen;
  const where = [place.buildingName, place.floorName].filter(Boolean);
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Vu sur le réseau
      </h3>
      <div className="space-y-0.5 text-sm">
        <div className="flex items-baseline gap-1.5">
          <span className="truncate">{place.switchName}</span>
          <span
            className="shrink-0 font-mono text-xs text-muted-foreground"
            title={place.portName}
          >
            {shortPortName(place.portName)}
          </span>
        </div>
        {place.socketName ? (
          <div className="truncate text-muted-foreground">
            {[place.socketName, ...where].join(" · ")}
          </div>
        ) : null}
        {/* The time only: the status says whether a read still vouches.
            How the port led to the device is said in passing (ADR 0038). */}
        <div className="text-xs text-muted-foreground">
          <Time at={at} format="when" now={now} />
          {place.socketId
            ? " · vu via un câble"
            : " · vu sur un port non documenté"}
        </div>
      </div>
    </section>
  );
}

/** Network, user, hardware and notes, each only when there is something. */
export function DeviceIdentitySections({ device }: { device: DetailedDevice }) {
  // NetBox's « undefined » models and « System Serial Number » serials, or
  // the same typed by hand, say nothing (A97).
  const model = meaningful(device.model);
  const serial = meaningful(device.serial);
  return (
    <>
      {device.hostname || device.ip || device.macs.length > 0 ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Réseau
          </h3>
          <div className="space-y-2">
            {device.hostname ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">Hostname</span>
                <CopyValue
                  value={device.hostname}
                  label="le hostname"
                  className="text-foreground"
                />
              </div>
            ) : null}
            {device.ip ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">IP</span>
                <CopyValue
                  value={device.ip}
                  label="l'adresse IP"
                  className="text-foreground"
                />
              </div>
            ) : null}
            {device.macs.map((mac) => (
              <div
                key={mac}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">MAC</span>
                <CopyValue
                  value={mac}
                  label="l'adresse MAC"
                  className="text-foreground"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {device.type === "pc" && device.metadata.lastUser ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Utilisateur
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-primary">
              <HugeiconsIcon
                icon={UserIcon}
                size={16}
                color="currentColor"
                strokeWidth={1.5}
              />
            </div>
            <div>
              <div className="font-medium text-foreground">
                {device.metadata.lastUser}
              </div>
              <div className="text-xs text-muted-foreground">
                Dernier connecté
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {model || serial ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Matériel
          </h3>
          <div className="space-y-2">
            {model ? (
              <div className="text-sm">
                <span className="text-foreground">{model}</span>
              </div>
            ) : null}
            {serial ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">N° de série</span>
                <CopyValue
                  value={serial}
                  label="le numéro de série"
                  className="text-foreground"
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {device.notes ? (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Notes
          </h3>
          <p className="text-sm whitespace-pre-wrap text-foreground">
            {device.notes}
          </p>
        </section>
      ) : null}
    </>
  );
}
