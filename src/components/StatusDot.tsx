import type { DeviceStatus } from "@/types/map";
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
      aria-label={decorative ? undefined : `Status: ${status}`}
      className={cn(
        "h-2 w-2 rounded-full",
        status === "up" && "bg-up",
        status === "down" && "bg-down",
        status === "unknown" && "bg-unknown",
        className,
      )}
    />
  );
}
