import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import NetworkNode from "./NetworkNode";
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
    <NetworkNode
      status={status}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      width={device.size.width}
      height={device.size.height}
      className="from-secondary to-secondary/80 bg-linear-to-b"
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
            status === "up" && "bg-up",
            status === "down" && "bg-down",
            status === "unknown" && "bg-unknown",
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
    </NetworkNode>
  );
}

export default memo(RackNode);
