import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, UserIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { DeviceNodeData, DeviceStatus } from "@/types/map";

type PcNodeType = Node<{ data: DeviceNodeData }>;

function PcNode({ data }: NodeProps<PcNodeType>) {
  const device = data.data;
  const status: DeviceStatus = device.metadata.status ?? "unknown";
  const isHighlighted = device.highlighted;
  const isSelected = device.selected;

  return (
    <div
      className={cn(
        "relative rounded-lg border-2 shadow-md cursor-grab active:cursor-grabbing transition-all duration-200 bg-card",
        status === "up" && "border-chart-2",
        status === "down" && "border-destructive",
        status === "unknown" && "border-border",
        isSelected && "border-ring! shadow-[0_0_12px_3px_var(--ring)]! ring-2 ring-ring",
        isHighlighted && !isSelected && "border-ring/70! shadow-[0_0_10px_2px_var(--ring)]!",
      )}
      style={{ width: device.size.width, height: device.size.height }}
    >
      {/* Content - hostname and lastUser inside */}
      <div className="absolute inset-1 flex flex-col justify-between overflow-hidden">
        {/* Top: small PC icon + status */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            <HugeiconsIcon icon={ComputerIcon} size={16} color="currentColor" strokeWidth={1.5} />
          </span>
          <div
            className={cn(
              "w-2 h-2 rounded-full",
              status === "up" && "bg-chart-2",
              status === "down" && "bg-destructive",
              status === "unknown" && "bg-muted-foreground",
            )}
          />
        </div>

        {/* Middle: hostname */}
        <div className="flex-1 flex items-center justify-center px-0.5">
          <span className="text-xs uppercase font-bold text-foreground truncate text-center leading-tight">
            {device.hostname ?? device.name}
          </span>
        </div>

        {/* Bottom: last user */}
        {device.metadata.lastUser ? (
          <div className="flex items-center gap-0.5 justify-center text-primary">
            <HugeiconsIcon icon={UserIcon} size={10} color="currentColor" strokeWidth={1.5} />
            <span className="text-[8px] truncate">{device.metadata.lastUser}</span>
          </div>
        ) : (
          <div className="h-2.5" />
        )}
      </div>

      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
}

export default memo(PcNode);
