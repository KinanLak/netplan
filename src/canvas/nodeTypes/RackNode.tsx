import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";
import type { Node, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

type RackNodeType = Node<{ data: DeviceNodeData }>;

function RackNode({ data }: NodeProps<RackNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  return (
    <div
      className={cn(
        "from-secondary to-secondary/80 relative cursor-grab rounded-lg bg-linear-to-b shadow-lg active:cursor-grabbing",
        "border-2 transition-all duration-200",
        isSelected &&
          "border-ring ring-ring shadow-[0_0_12px_3px_var(--ring)] ring-2",
        isHighlighted &&
          !isSelected &&
          "border-ring/70 shadow-[0_0_10px_2px_var(--ring)]",
        !isSelected && !isHighlighted && "border-border",
      )}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Rack frame details */}
      <div className="border-border absolute inset-1 rounded border opacity-50" />

      {/* Header with label and status */}
      <div className="absolute top-1 right-1 left-1 flex items-center justify-between px-1">
        <span className="text-foreground truncate text-[8px] font-medium">
          {device.name}
        </span>
        <div
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status === "up" && "bg-chart-2",
            status === "down" && "bg-destructive",
            status === "unknown" && "bg-muted-foreground",
          )}
        />
      </div>

      {/* Rack slots visualization */}
      <div className="absolute inset-2 top-5 flex flex-col gap-0.5 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-muted border-border h-3 w-full rounded-sm border"
          />
        ))}
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(RackNode);
