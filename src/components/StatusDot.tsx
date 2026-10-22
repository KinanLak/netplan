import type { DeviceStatus } from "@/types/map";
import { DEVICE_STATUS_CLASSES, DEVICE_STATUS_LABELS } from "@/devices/status";
import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: DeviceStatus;
  className?: string;
  decorative?: boolean;
}

export function StatusDot({
  status,
  className,
  decorative = false,
}: StatusDotProps) {
  return (
    <div
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={
        decorative ? undefined : `Statut : ${DEVICE_STATUS_LABELS[status]}`
      }
      className={cn(
        "h-2 w-2 rounded-full",
        DEVICE_STATUS_CLASSES[status].dot,
        className,
      )}
    />
  );
}
