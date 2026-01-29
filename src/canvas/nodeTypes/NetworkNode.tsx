import { forwardRef } from "react";
import type { DeviceStatus } from "@/types/map";
import { cn } from "@/lib/utils";

export interface NetworkNodeProps {
  /** Device status for border and shadow color */
  status: DeviceStatus;
  /** Whether the node is currently selected */
  isSelected?: boolean;
  /** Whether the node is highlighted (e.g., connected devices) */
  isHighlighted?: boolean;
  /** Node dimensions */
  width: number;
  height: number;
  /** Additional CSS classes */
  className?: string;
  /** Content inside the node */
  children: React.ReactNode;
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
const NetworkNode = forwardRef<HTMLDivElement, NetworkNodeProps>(
  (
    {
      status,
      isSelected = false,
      isHighlighted = false,
      width,
      height,
      className,
      children,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          // Base styles
          "relative cursor-grab rounded-sm border-2 transition-all duration-200 active:cursor-grabbing",

          // Status-based border color (always applied)
          status === "up" && "border-up",
          status === "down" && "border-down",
          status === "unknown" && "border-unknown",

          // Selection: shadow glow matching status color
          isSelected && status === "up" && "shadow-[0_0_8px_2px_var(--up)]!",
          isSelected &&
            status === "down" &&
            "shadow-[0_0_8px_2px_var(--down)]!",
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
  },
);

NetworkNode.displayName = "NetworkNode";

export default NetworkNode;
