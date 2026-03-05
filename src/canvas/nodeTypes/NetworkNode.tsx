import type { DeviceStatus } from "@/types/map";
import { cn } from "@/lib/utils";
import {
  useIsDeviceHighlighted,
  useIsDeviceSelected,
  useIsEditMode,
} from "@/store/selectors";

export interface NetworkNodeProps {
  /** React Flow node id — used to read selection/highlight state */
  id: string;
  /** Device status for border and shadow color */
  status: DeviceStatus;
  /** Node dimensions */
  width: number;
  height: number;
  /** Additional CSS classes */
  className?: string;
  /** Content inside the node */
  children: React.ReactNode;
  /** React 19: ref is a regular prop for function components */
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Base wrapper component for all network device nodes.
 * Provides unified styling for selection, highlighting, and status indication.
 *
 * Selection behavior:
 * - No ring effect
 * - Shadow color matches the device status
 * - Border keeps the status color
 */
export default function NetworkNode({
  id,
  status,
  width,
  height,
  className,
  children,
  ref,
}: NetworkNodeProps) {
  const isEditMode = useIsEditMode();
  const isSelected = useIsDeviceSelected(id);
  const isHighlighted = useIsDeviceHighlighted(id);

  return (
    <div
      ref={ref}
      className={cn(
        // Base styles
        "network-node relative rounded-sm border-2 transition-all duration-200",
        isEditMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",

        // Status-based border color (always applied)
        status === "up" && "border-up",
        status === "down" && "border-down",
        status === "unknown" && "border-unknown",

        // Selection: shadow glow matching status color
        isSelected && status === "up" && "shadow-[0_0_8px_2px_var(--up)]!",
        isSelected && status === "down" && "shadow-[0_0_8px_2px_var(--down)]!",
        isSelected &&
          status === "unknown" &&
          "shadow-[0_0_8px_2px_var(--unknown)]!",

        // Highlight (non-selected): subtle shadow
        isHighlighted &&
          !isSelected &&
          status === "up" &&
          "shadow-[0_0_6px_1px_var(--up)]!",
        isHighlighted &&
          !isSelected &&
          status === "down" &&
          "shadow-[0_0_6px_1px_var(--down)]!",
        isHighlighted &&
          !isSelected &&
          status === "unknown" &&
          "shadow-[0_0_6px_1px_var(--unknown)]!",

        // Default shadow when not selected/highlighted
        !isSelected && !isHighlighted && "shadow-md",

        className,
      )}
      style={{ width, height }}
    >
      {children}
    </div>
  );
}
