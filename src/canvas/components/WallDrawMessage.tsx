import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useDrawingHelpClass } from "./drawingHelp";

/** Why the last wall or room drawn was refused, while a wall tool is on. */
export function WallDrawMessage({
  isVisible,
  message,
}: {
  isVisible: boolean;
  message: string | null;
}) {
  const className = useDrawingHelpClass();
  if (!isVisible || !message) return null;

  return (
    <p
      className={cn(className, "flex items-start gap-2 text-destructive")}
      role="status"
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        size={14}
        strokeWidth={2}
        className="mt-px shrink-0"
      />
      {message}
    </p>
  );
}
