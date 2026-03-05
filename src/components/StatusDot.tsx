import type { DeviceStatus } from "@/types/map";
import { cn } from "@/lib/utils";

interface StatusDotProps {
  status: DeviceStatus;
  className?: string;
}

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <div
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
