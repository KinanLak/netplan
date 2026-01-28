import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";

type RackNodeType = Node<{ data: DeviceNodeData }>;

function RackNode({ data }: NodeProps<RackNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  return (
    <div
      className={cn(
        "relative bg-linear-to-b from-secondary to-secondary/80 rounded-lg shadow-lg cursor-grab active:cursor-grabbing",
        "border-2 transition-all duration-200",
        isSelected && "border-ring shadow-[0_0_12px_3px_var(--ring)] ring-2 ring-ring",
        isHighlighted && !isSelected && "border-ring/70 shadow-[0_0_10px_2px_var(--ring)]",
        !isSelected && !isHighlighted && "border-border",
      )}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Rack frame details */}
      <div className="absolute inset-1 border border-border rounded opacity-50" />

      {/* Header with label and status */}
      <div className="absolute top-1 left-1 right-1 flex items-center justify-between px-1">
        <span className="text-[8px] font-medium text-foreground truncate">{device.name}</span>
        <div
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            status === "up" && "bg-chart-2",
            status === "down" && "bg-destructive",
            status === "unknown" && "bg-muted-foreground",
          )}
        />
      </div>

      {/* Rack slots visualization */}
      <div className="absolute inset-2 top-5 flex flex-col gap-0.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-muted rounded-sm border border-border h-3 w-full" />
        ))}
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(RackNode);
