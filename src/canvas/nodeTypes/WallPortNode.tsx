import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";

type WallPortNodeType = Node<{ data: DeviceNodeData }>;

function WallPortNode({ data }: NodeProps<WallPortNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  return (
    <div
      className={cn(
        "relative rounded shadow cursor-grab active:cursor-grabbing bg-card",
        "border-2 transition-all duration-200",
        isSelected && "border-ring shadow-[0_0_12px_3px_var(--ring)] ring-2 ring-ring",
        isHighlighted && !isSelected && "border-ring/70 shadow-[0_0_10px_2px_var(--ring)]",
        !isSelected && !isHighlighted && status === "up" && "border-chart-2",
        !isSelected && !isHighlighted && status === "down" && "border-destructive",
        !isSelected && !isHighlighted && status === "unknown" && "border-border",
      )}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Content: RJ45 icon + label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn(
            "mb-1",
            status === "up" && "text-chart-2",
            status === "down" && "text-destructive",
            status === "unknown" && "text-muted-foreground",
          )}
        >
          <HugeiconsIcon icon={PlugSocketIcon} size={14} color="currentColor" strokeWidth={1.5} />
        </div>
        {/* Label inside */}
        <span className="text-2xs font-medium text-muted-foreground truncate max-w-max px-0.5 leading-tight">
          {device.name}
        </span>
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(WallPortNode);
